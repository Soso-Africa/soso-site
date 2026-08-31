import type { IncomingHttpHeaders } from "node:http";

const GDPR_COUNTRY_CODES = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE",
  "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT",
  "RO", "SK", "SI", "ES", "SE",
  "IS", "LI", "NO",
  "GB",
]);

const ISO_COUNTRY_CODES = new Set(
  `AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ
BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ
CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ
DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR
GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY
HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP
KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY
MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ
NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY
QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ
TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ
VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW`.split(/\s+/),
);

export type ConsentRegion = "regulated" | "non_regulated" | "unknown";

export type ConsentRegionClassification = {
  countryCode: string | null;
  region: ConsentRegion;
  consentRequired: boolean;
};

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function trustedCountryCode(headers: IncomingHttpHeaders): string | null {
  // SOSO production runs on Vercel. Vercel owns and overwrites this edge
  // header; alternate CDN header names are not trusted on this deployment.
  const candidate = firstHeaderValue(headers["x-vercel-ip-country"]);
  if (!candidate) return null;
  const normalized = candidate.trim().toUpperCase();
  return ISO_COUNTRY_CODES.has(normalized) ? normalized : null;
}

export function classifyConsentRegion(headers: IncomingHttpHeaders): ConsentRegionClassification {
  const countryCode = trustedCountryCode(headers);
  if (!countryCode) {
    return { countryCode: null, region: "unknown", consentRequired: true };
  }
  if (GDPR_COUNTRY_CODES.has(countryCode)) {
    return { countryCode, region: "regulated", consentRequired: true };
  }
  return { countryCode, region: "non_regulated", consentRequired: false };
}

export function canRecordRegionDefaultConsent(
  state: string,
  classification: ConsentRegionClassification,
): boolean {
  return state === "analytics" && !classification.consentRequired;
}