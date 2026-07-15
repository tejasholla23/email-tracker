const https = require("https");
const { URL } = require("url");

function extractFormId(formUrl) {
  try {
    const parsed = new URL(formUrl);
    if (parsed.hostname === "forms.gle") {
      return { success: false, error: { code: "REDIRECT_REQUIRED", message: "forms.gle link needs resolving" } };
    }
    const pathname = parsed.pathname;
    const match = pathname.match(/\/forms\/d\/e\/([a-zA-Z0-9_-]+)/);
    if (match && match[1]) {
      return { success: true, data: match[1] };
    }
    const matchAlt = pathname.match(/\/forms\/d\/([a-zA-Z0-9_-]+)/);
    if (matchAlt && matchAlt[1]) {
      return { success: true, data: matchAlt[1] };
    }
    return { success: false, error: { code: "INVALID_URL", message: "Not a recognized Google Forms URL" } };
  } catch (e) {
    return { success: false, error: { code: "INVALID_URL", message: e.message } };
  }
}

function resolveUrl(formUrl) {
  return new Promise((resolve) => {
    try {
      const parsed = new URL(formUrl);
      if (parsed.hostname !== "forms.gle") {
        return resolve({ success: true, data: formUrl });
      }

      const options = {
        method: "HEAD",
        timeout: 8000,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        }
      };

      const req = https.request(formUrl, options, (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
          resolve({ success: true, data: res.headers.location });
        } else {
          resolve({ success: true, data: formUrl });
        }
      });

      req.on("error", (err) => {
        resolve({ success: false, error: { code: "FETCH_FAILED", message: `Redirect lookup failed: ${err.message}` } });
      });

      req.on("timeout", () => {
        req.destroy();
        resolve({ success: false, error: { code: "FETCH_FAILED", message: "Redirect lookup timed out" } });
      });

      req.end();
    } catch (e) {
      resolve({ success: false, error: { code: "INVALID_URL", message: e.message } });
    }
  });
}

function fetchHtml(targetUrl) {
  return new Promise((resolve) => {
    try {
      const parsed = new URL(targetUrl);
      const options = {
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        },
        timeout: 10000,
      };

      const req = https.request(options, (res) => {
        if (res.statusCode !== 200) {
          resolve({ success: false, error: { code: "FETCH_FAILED", message: `HTTP status code: ${res.statusCode}` } });
          return;
        }

        let body = "";
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          resolve({ success: true, data: body });
        });
      });

      req.on("error", (err) => {
        resolve({ success: false, error: { code: "FETCH_FAILED", message: err.message } });
      });

      req.on("timeout", () => {
        req.destroy();
        resolve({ success: false, error: { code: "FETCH_FAILED", message: "Request timed out" } });
      });

      req.end();
    } catch (e) {
      resolve({ success: false, error: { code: "INVALID_URL", message: e.message } });
    }
  });
}

async function fetchAndParseForm(formUrl) {
  // 1. Resolve forms.gle
  const resolvedRes = await resolveUrl(formUrl);
  if (!resolvedRes.success) {
    return resolvedRes;
  }
  const realUrl = resolvedRes.data;

  // 2. Extract formId
  const idRes = extractFormId(realUrl);
  if (!idRes.success) {
    return idRes;
  }

  // 3. Fetch HTML
  const htmlRes = await fetchHtml(realUrl);
  if (!htmlRes.success) {
    return htmlRes;
  }
  const html = htmlRes.data;

  // 4. Parse FB_PUBLIC_LOAD_DATA_
  try {
    const match = html.match(/FB_PUBLIC_LOAD_DATA_\s*=\s*([\s\S]*?);/);
    if (!match || !match[1]) {
      return { success: false, error: { code: "PARSE_FAILED", message: "FB_PUBLIC_LOAD_DATA_ not found in form HTML" } };
    }

    const rawJson = match[1].trim();
    const data = JSON.parse(rawJson);
    const items = data[1] || [];
    const fields = [];

    for (const item of items) {
      if (!item || !Array.isArray(item)) continue;
      const label = item[1];
      const typeCode = item[3];
      if (!label || typeCode === undefined) continue;

      let type = "text";
      if (typeCode === 0) type = "text";
      else if (typeCode === 1) type = "paragraph";
      else if (typeCode === 2) type = "radio";
      else if (typeCode === 3) type = "dropdown";
      else if (typeCode === 4) type = "checkbox";
      else if (typeCode === 9) type = "date";
      else if (typeCode === 13) type = "file";

      // Extract entry details
      const entryDetails = item[4] && item[4][0];
      if (!entryDetails || !Array.isArray(entryDetails)) continue;
      const fieldId = entryDetails[0];
      if (fieldId === undefined || fieldId === null) continue;

      // Extract options if applicable
      const options = [];
      const rawOptions = entryDetails[1];
      if (Array.isArray(rawOptions)) {
        for (const opt of rawOptions) {
          if (opt && Array.isArray(opt) && typeof opt[0] === "string") {
            options.push(opt[0]);
          }
        }
      }

      fields.push({
        fieldId: `entry.${fieldId}`,
        label: label.trim(),
        type,
        options,
      });
    }

    if (fields.length === 0) {
      return { success: false, error: { code: "INVALID_STRUCTURE", message: "No form fields extracted from layout" } };
    }

    return { success: true, data: fields };
  } catch (e) {
    return { success: false, error: { code: "PARSE_FAILED", message: `Parse execution error: ${e.message}` } };
  }
}

function buildPrefillUrl(formUrl, mappedFields, temporaryEdits = {}) {
  try {
    const parsed = new URL(formUrl);
    let basePath = parsed.pathname;
    if (basePath.endsWith("/formResponse")) {
      basePath = basePath.replace(/\/formResponse$/, "/viewform");
    } else if (!basePath.endsWith("/viewform")) {
      if (basePath.endsWith("/")) basePath += "viewform";
      else basePath += "/viewform";
    }

    const queryParams = new URLSearchParams();
    queryParams.set("usp", "pp_url");

    if (Array.isArray(mappedFields)) {
      for (const field of mappedFields) {
        if (field.type === "file") continue; // Skip file uploads

        const tempKey = field.fieldId;
        let value = "";
        
        let tempObj = null;
        if (temporaryEdits && typeof temporaryEdits.get === "function") {
          tempObj = temporaryEdits.get(tempKey);
        } else if (temporaryEdits) {
          tempObj = temporaryEdits[tempKey];
        }

        if (tempObj && tempObj.value !== undefined) {
          value = tempObj.value;
        } else {
          value = field.mappedValue || "";
        }

        if (value) {
          queryParams.set(field.fieldId, value);
        }
      }
    }

    return `${parsed.protocol}//${parsed.hostname}${basePath}?${queryParams.toString()}`;
  } catch (e) {
    return formUrl;
  }
}

module.exports = {
  extractFormId,
  resolveUrl,
  fetchAndParseForm,
  buildPrefillUrl,
};
