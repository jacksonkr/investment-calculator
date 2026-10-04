// Fills in the App Store listing from listing.json through the App Store
// Connect API. Nothing here submits the app for review except `submit`.
//
//   ASC_KEY_ID=…  ASC_ISSUER_ID=…  [ASC_KEY_PATH=…]  node store/asc.mjs <command>
//
// Commands:
//   status               what is filled in and what is missing
//   listing              name, subtitle, description, keywords, URLs, categories, copyright
//   screenshots          replaces the iPhone and iPad screenshots
//   age-rating           answers "none" to every age rating question
//   pricing              makes the app free in every territory
//   review <phone>       App Review contact details and notes
//   build <number>       attaches an uploaded build to the version
//   submit               sends the version to App Review
//
// ASC_KEY_PATH defaults to ~/.appstoreconnect/private_keys/AuthKey_<ASC_KEY_ID>.p8.

import { createHash, createPrivateKey, sign } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const listing = JSON.parse(readFileSync(join(HERE, "listing.json"), "utf8"));

const { ASC_KEY_ID, ASC_ISSUER_ID } = process.env;
if (!ASC_KEY_ID || !ASC_ISSUER_ID) {
  console.error("Set ASC_KEY_ID and ASC_ISSUER_ID (and ASC_KEY_PATH if the key is elsewhere).");
  process.exit(1);
}
const keyPath =
  process.env.ASC_KEY_PATH ?? join(homedir(), ".appstoreconnect", "private_keys", `AuthKey_${ASC_KEY_ID}.p8`);
const privateKey = createPrivateKey(readFileSync(keyPath, "utf8"));

function token() {
  const now = Math.floor(Date.now() / 1000);
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const body = `${encode({ alg: "ES256", kid: ASC_KEY_ID, typ: "JWT" })}.${encode({
    iss: ASC_ISSUER_ID,
    iat: now,
    exp: now + 15 * 60,
    aud: "appstoreconnect-v1",
  })}`;
  const signature = sign("sha256", Buffer.from(body), { key: privateKey, dsaEncoding: "ieee-p1363" });
  return `${body}.${signature.toString("base64url")}`;
}

async function api(method, path, body) {
  const response = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
    method,
    headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (response.status === 204) return null;
  const json = await response.json().catch(() => null);
  if (!response.ok) {
    const details = json?.errors?.map((e) => `${e.title}: ${e.detail}`).join("\n  ") ?? response.statusText;
    throw new Error(`${method} ${path} → ${response.status}\n  ${details}`);
  }
  return json;
}

const ref = (type, id) => ({ data: { type, id } });

// The app, its editable app info and the version waiting to be submitted.
async function context() {
  const apps = await api("GET", `/v1/apps?filter[bundleId]=${listing.bundleId}`);
  const app = apps.data[0];
  if (!app) throw new Error(`No app with bundle ID ${listing.bundleId} in App Store Connect.`);

  const infos = await api("GET", `/v1/apps/${app.id}/appInfos`);
  const info =
    infos.data.find((i) => !["READY_FOR_DISTRIBUTION", "REPLACED_WITH_NEW_INFO"].includes(i.attributes.state)) ??
    infos.data[0];

  const versions = await api("GET", `/v1/apps/${app.id}/appStoreVersions?filter[platform]=IOS`);
  const version = versions.data.find((v) =>
    ["PREPARE_FOR_SUBMISSION", "DEVELOPER_REJECTED", "REJECTED", "METADATA_REJECTED"].includes(
      v.attributes.appStoreState,
    ),
  );
  if (!version) throw new Error("No iOS version is open for editing. Create one in App Store Connect first.");
  return { app, info, version };
}

async function infoLocalization(info) {
  const list = await api("GET", `/v1/appInfos/${info.id}/appInfoLocalizations`);
  return list.data.find((l) => l.attributes.locale === listing.locale);
}

async function versionLocalization(version) {
  const list = await api("GET", `/v1/appStoreVersions/${version.id}/appStoreVersionLocalizations`);
  const found = list.data.find((l) => l.attributes.locale === listing.locale);
  if (found) return found;
  const created = await api("POST", "/v1/appStoreVersionLocalizations", {
    data: {
      type: "appStoreVersionLocalizations",
      attributes: { locale: listing.locale },
      relationships: { appStoreVersion: ref("appStoreVersions", version.id) },
    },
  });
  return created.data;
}

const commands = {
  async status() {
    const { app, info, version } = await context();
    const infoLoc = await infoLocalization(info);
    const versionLoc = await versionLocalization(version);
    const sets = await api("GET", `/v1/appStoreVersionLocalizations/${versionLoc.id}/appScreenshotSets?include=appScreenshots`);
    const build = await api("GET", `/v1/appStoreVersions/${version.id}/build`);
    const review = await api("GET", `/v1/appStoreVersions/${version.id}/appStoreReviewDetail`).catch(() => null);
    const builds = await api("GET", `/v1/builds?filter[app]=${app.id}&sort=-uploadedDate&limit=5`);

    const v = versionLoc.attributes;
    const rows = [
      ["App", `${app.attributes.name} (${app.id})`],
      ["Version", `${version.attributes.versionString}, ${version.attributes.appStoreState}`],
      ["Name / subtitle", `${infoLoc?.attributes.name ?? "—"} / ${infoLoc?.attributes.subtitle ?? "—"}`],
      ["Privacy policy URL", infoLoc?.attributes.privacyPolicyUrl ?? "MISSING"],
      ["Description", v.description ? `${v.description.length} characters` : "MISSING"],
      ["Keywords", v.keywords ?? "MISSING"],
      ["Support URL", v.supportUrl ?? "MISSING"],
      ["Copyright", version.attributes.copyright ?? "MISSING"],
      [
        "Screenshots",
        sets.data.length
          ? sets.data.map((s) => `${s.attributes.screenshotDisplayType} ×${s.relationships.appScreenshots.data.length}`).join(", ")
          : "MISSING",
      ],
      ["Build", build.data ? `${build.data.attributes.version}` : "not attached"],
      ["Review contact", review?.data ? `${review.data.attributes.contactEmail ?? "—"}` : "MISSING"],
      ["Content rights", app.attributes.contentRightsDeclaration ?? "MISSING (answer in App Store Connect)"],
      [
        "Recent builds",
        builds.data.map((b) => `${b.attributes.version} ${b.attributes.processingState}`).join(", ") || "none",
      ],
    ];
    for (const [label, value] of rows) console.log(`${label.padEnd(20)} ${value}`);
    console.log("\nApp Privacy answers can only be set on the website (App Privacy → Data Not Collected).");
  },

  async listing() {
    const { info, version } = await context();
    const infoLoc = await infoLocalization(info);
    await api("PATCH", `/v1/appInfoLocalizations/${infoLoc.id}`, {
      data: {
        type: "appInfoLocalizations",
        id: infoLoc.id,
        attributes: { name: listing.name, subtitle: listing.subtitle, privacyPolicyUrl: listing.privacyPolicyUrl },
      },
    });
    await api("PATCH", `/v1/appInfos/${info.id}`, {
      data: {
        type: "appInfos",
        id: info.id,
        relationships: {
          primaryCategory: ref("appCategories", listing.primaryCategory),
          secondaryCategory: ref("appCategories", listing.secondaryCategory),
        },
      },
    });
    const versionLoc = await versionLocalization(version);
    await api("PATCH", `/v1/appStoreVersionLocalizations/${versionLoc.id}`, {
      data: {
        type: "appStoreVersionLocalizations",
        id: versionLoc.id,
        attributes: {
          description: listing.description,
          keywords: listing.keywords,
          promotionalText: listing.promotionalText,
          supportUrl: listing.supportUrl,
        },
      },
    });
    await api("PATCH", `/v1/appStoreVersions/${version.id}`, {
      data: { type: "appStoreVersions", id: version.id, attributes: { copyright: listing.copyright } },
    });
    console.log("Listing text, URLs, categories and copyright updated.");
  },

  async screenshots() {
    const { version } = await context();
    const versionLoc = await versionLocalization(version);
    const sets = await api("GET", `/v1/appStoreVersionLocalizations/${versionLoc.id}/appScreenshotSets`);

    for (const [displayType, files] of Object.entries(listing.screenshots)) {
      let set = sets.data.find((s) => s.attributes.screenshotDisplayType === displayType);
      if (set) {
        const existing = await api("GET", `/v1/appScreenshotSets/${set.id}/appScreenshots`);
        for (const shot of existing.data) await api("DELETE", `/v1/appScreenshots/${shot.id}`);
      } else {
        set = (
          await api("POST", "/v1/appScreenshotSets", {
            data: {
              type: "appScreenshotSets",
              attributes: { screenshotDisplayType: displayType },
              relationships: { appStoreVersionLocalization: ref("appStoreVersionLocalizations", versionLoc.id) },
            },
          })
        ).data;
      }

      for (const file of files) {
        const path = join(HERE, file);
        const bytes = readFileSync(path);
        const reserved = await api("POST", "/v1/appScreenshots", {
          data: {
            type: "appScreenshots",
            attributes: { fileName: file.split("/").pop(), fileSize: statSync(path).size },
            relationships: { appScreenshotSet: ref("appScreenshotSets", set.id) },
          },
        });
        for (const op of reserved.data.attributes.uploadOperations) {
          const headers = Object.fromEntries(op.requestHeaders.map((h) => [h.name, h.value]));
          const put = await fetch(op.url, {
            method: op.method,
            headers,
            body: bytes.subarray(op.offset, op.offset + op.length),
          });
          if (!put.ok) throw new Error(`Uploading ${file} failed: ${put.status}`);
        }
        await api("PATCH", `/v1/appScreenshots/${reserved.data.id}`, {
          data: {
            type: "appScreenshots",
            id: reserved.data.id,
            attributes: { uploaded: true, sourceFileChecksum: createHash("md5").update(bytes).digest("hex") },
          },
        });
        console.log(`Uploaded ${file}`);
      }
    }
  },

  async "age-rating"() {
    const { info } = await context();
    const declaration = (await api("GET", `/v1/appInfos/${info.id}/ageRatingDeclaration`)).data;
    // Answer only the questions Apple currently asks, as returned above.
    const yesNo = new Set([
      "gambling", "unrestrictedWebAccess", "lootBox", "messagingAndChat", "parentalControls",
      "ageAssurance", "userGeneratedContent", "advertising", "healthOrWellnessTopics", "seventeenPlus",
      "socialMedia", "socialMediaAgeRestricted",
    ]);
    // Overrides, regional ratings and links aren't questions; leave them unset.
    const skip = /^kidsAgeBand$|override|korea|grac|url/i;
    const attributes = {};
    for (const key of Object.keys(declaration.attributes)) {
      if (skip.test(key)) continue;
      attributes[key] = yesNo.has(key) ? false : "NONE";
    }
    await api("PATCH", `/v1/ageRatingDeclarations/${declaration.id}`, {
      data: { type: "ageRatingDeclarations", id: declaration.id, attributes },
    });
    console.log(`Answered ${Object.keys(attributes).length} age rating questions with "none".`);
  },

  async pricing() {
    const { app } = await context();
    const points = await api("GET", `/v1/apps/${app.id}/appPricePoints?filter[territory]=USA&limit=200`);
    const free = points.data.find((p) => Number(p.attributes.customerPrice) === 0);
    if (!free) throw new Error("Couldn't find the free price point.");
    await api("POST", "/v1/appPriceSchedules", {
      data: {
        type: "appPriceSchedules",
        relationships: {
          app: ref("apps", app.id),
          baseTerritory: ref("territories", "USA"),
          manualPrices: { data: [{ type: "appPrices", id: "${free}" }] },
        },
      },
      included: [
        {
          type: "appPrices",
          id: "${free}",
          attributes: { startDate: null },
          relationships: { appPricePoint: ref("appPricePoints", free.id) },
        },
      ],
    });
    const territories = await api("GET", "/v1/territories?limit=200");
    await api("POST", "/v2/appAvailabilities", {
      data: {
        type: "appAvailabilities",
        attributes: { availableInNewTerritories: true },
        relationships: {
          app: ref("apps", app.id),
          territoryAvailabilities: {
            data: territories.data.map((t) => ({ type: "territoryAvailabilities", id: `\${${t.id}}` })),
          },
        },
      },
      included: territories.data.map((t) => ({
        type: "territoryAvailabilities",
        id: `\${${t.id}}`,
        attributes: { available: true },
        relationships: { territory: ref("territories", t.id) },
      })),
    });
    console.log(`Free, available in all ${territories.data.length} territories and new ones as they're added.`);
  },

  async review(phone) {
    if (!phone) throw new Error("Pass the contact phone number, e.g. review +15551234567");
    const { version } = await context();
    const attributes = {
      contactFirstName: listing.review.firstName,
      contactLastName: listing.review.lastName,
      contactEmail: listing.review.email,
      contactPhone: phone,
      demoAccountRequired: false,
      notes: listing.reviewNotes,
    };
    const existing = await api("GET", `/v1/appStoreVersions/${version.id}/appStoreReviewDetail`).catch(() => null);
    if (existing?.data) {
      await api("PATCH", `/v1/appStoreReviewDetails/${existing.data.id}`, {
        data: { type: "appStoreReviewDetails", id: existing.data.id, attributes },
      });
    } else {
      await api("POST", "/v1/appStoreReviewDetails", {
        data: {
          type: "appStoreReviewDetails",
          attributes,
          relationships: { appStoreVersion: ref("appStoreVersions", version.id) },
        },
      });
    }
    console.log("App Review contact and notes saved.");
  },

  async build(number) {
    if (!number) throw new Error("Pass the build number, e.g. build 4");
    const { app, version } = await context();
    const builds = await api("GET", `/v1/builds?filter[app]=${app.id}&filter[version]=${number}`);
    const build = builds.data[0];
    if (!build) throw new Error(`Build ${number} isn't in App Store Connect.`);
    if (build.attributes.processingState !== "VALID") {
      throw new Error(`Build ${number} is ${build.attributes.processingState}; wait for processing to finish.`);
    }
    await api("PATCH", `/v1/appStoreVersions/${version.id}/relationships/build`, ref("builds", build.id));
    console.log(`Build ${number} attached to version ${version.attributes.versionString}.`);
  },

  async submit() {
    const { app, version } = await context();
    const submission = (
      await api("POST", "/v1/reviewSubmissions", {
        data: { type: "reviewSubmissions", attributes: { platform: "IOS" }, relationships: { app: ref("apps", app.id) } },
      })
    ).data;
    await api("POST", "/v1/reviewSubmissionItems", {
      data: {
        type: "reviewSubmissionItems",
        relationships: {
          reviewSubmission: ref("reviewSubmissions", submission.id),
          appStoreVersion: ref("appStoreVersions", version.id),
        },
      },
    });
    await api("PATCH", `/v1/reviewSubmissions/${submission.id}`, {
      data: { type: "reviewSubmissions", id: submission.id, attributes: { submitted: true } },
    });
    console.log(`Version ${version.attributes.versionString} submitted for review.`);
  },
};

const [command, ...args] = process.argv.slice(2);
if (!commands[command]) {
  console.error(`Usage: node store/asc.mjs <${Object.keys(commands).join("|")}>`);
  process.exit(1);
}
commands[command](...args).catch((error) => {
  console.error(error.message);
  process.exit(1);
});
