const { GoogleGenerativeAI } = require("@google/generative-ai");
const axios = require("axios");

function normalizeWhitespace(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function clampText(text, maxChars) {
  const normalized = normalizeWhitespace(text);
  if (!maxChars || normalized.length <= maxChars) return normalized;

  const slice = normalized.slice(0, maxChars);
  const lastBreak = Math.max(
    slice.lastIndexOf(". "),
    slice.lastIndexOf("! "),
    slice.lastIndexOf("? "),
    slice.lastIndexOf("\n"),
  );

  const cut = lastBreak > 60 ? slice.slice(0, lastBreak + 1) : slice;
  return cut.trim();
}

function clampTextWithinRange(text, minChars, maxChars) {
  const normalized = normalizeWhitespace(text);
  if (!maxChars) return normalized;
  if (
    normalized.length <= maxChars &&
    (!minChars || normalized.length >= minChars)
  ) {
    return normalized;
  }

  if (normalized.length > maxChars) {
    const slice = normalized.slice(0, maxChars);
    const lastBreak = Math.max(
      slice.lastIndexOf(". "),
      slice.lastIndexOf("! "),
      slice.lastIndexOf("? "),
      slice.lastIndexOf("\n"),
    );

    const candidate = (
      lastBreak > 60 ? slice.slice(0, lastBreak + 1) : slice
    ).trim();
    if (minChars && candidate.length < minChars) {
      return slice.trim();
    }
    return candidate;
  }

  return normalized;
}

function clampTitle(title, maxChars = 255) {
  const normalized = normalizeWhitespace(title)
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/\s+[|:-]\s+(marvel|dc|image|dark horse|boom!|idw).*$/i, "")
    .trim();

  if (!normalized) return "";
  return normalized.slice(0, maxChars).trim();
}

function clampIssueNumber(issueNumber, maxChars = 32) {
  const normalized = normalizeWhitespace(issueNumber)
    .replace(/^["'`\s]+|["'`\s]+$/g, "")
    .trim();

  if (!normalized) return "";
  return normalized.slice(0, maxChars).trim();
}

function combineTitleAndIssue(title, issueNumber) {
  const normalizedTitle = clampTitle(title);
  const normalizedIssue = clampIssueNumber(issueNumber);

  if (!normalizedTitle) return "";
  if (!normalizedIssue) return normalizedTitle;

  const titleLower = normalizedTitle.toLowerCase();
  const issueLower = normalizedIssue.toLowerCase();
  if (titleLower.includes(issueLower)) {
    return normalizedTitle;
  }

  const formattedIssue = /^#|^vol\.?\s*\d+/i.test(normalizedIssue)
    ? normalizedIssue
    : `#${normalizedIssue}`;

  return clampTitle(`${normalizedTitle} ${formattedIssue}`);
}

function normalizeLocale(locale) {
  const normalized = normalizeWhitespace(locale).toLowerCase();

  if (!normalized) return "";
  if (normalized.includes("pt-br") || normalized.includes("brazil")) {
    return "pt-BR";
  }
  if (normalized.includes("en-us") || normalized.includes("english")) {
    return "en-US";
  }

  return "";
}

function normalizePublisher(publisher, maxChars = 80) {
  const normalized = normalizeWhitespace(publisher);
  if (!normalized) return "";
  return normalized.slice(0, maxChars).trim();
}

function normalizeEditionType(editionType, maxChars = 80) {
  const normalized = normalizeWhitespace(editionType);
  if (!normalized) return "";
  return normalized.slice(0, maxChars).trim();
}

function normalizeVolume(volume, maxChars = 40) {
  const normalized = normalizeWhitespace(volume)
    .replace(/^volume\s*/i, "")
    .trim();

  if (!normalized) return "";
  return normalized.slice(0, maxChars).trim();
}

function normalizeTotalIssues(totalIssues, maxChars = 20) {
  const normalized = normalizeWhitespace(totalIssues)
    .replace(/^de\s+/i, "")
    .trim();

  if (!normalized) return "";
  return normalized.slice(0, maxChars).trim();
}

function buildResolvedTitle(metadata, fallbackTitle = "") {
  const primaryTitle = combineTitleAndIssue(
    metadata?.title || fallbackTitle,
    metadata?.issueNumber || "",
  );

  if (!primaryTitle) return "";

  const editionType = normalizeEditionType(metadata?.editionType || "");
  const volume = normalizeVolume(metadata?.volume || "");
  const totalIssues = normalizeTotalIssues(metadata?.totalIssues || "");
  const extras = [];

  if (volume) {
    extras.push(`${volume} volume`);
  }
  if (editionType) {
    extras.push(editionType);
  }
  if (totalIssues) {
    extras.push(`${primaryTitle.includes("#") ? "of" : "de"} ${totalIssues}`);
  }

  return primaryTitle;
}

function buildSearchQuery(title, metadata = {}) {
  const parts = [title];
  const publisher = normalizePublisher(metadata.publisher || "");
  const editionType = normalizeEditionType(metadata.editionType || "");
  const volume = normalizeVolume(metadata.volume || "");
  const totalIssues = normalizeTotalIssues(metadata.totalIssues || "");
  const locale = normalizeLocale(metadata.locale || "");

  if (volume) {
    parts.push(`${volume} volume`);
  }
  if (editionType) {
    parts.push(editionType);
  }
  if (totalIssues) {
    parts.push(`${totalIssues} issues`);
  }
  if (publisher) {
    parts.push(publisher);
  }
  if (locale === "pt-BR") {
    parts.push("quadrinhos brasil");
  }

  return normalizeWhitespace(parts.filter(Boolean).join(" "));
}

function getOutputLanguage(metadata = {}, title = "") {
  const locale = normalizeLocale(metadata.locale || "");
  if (locale) {
    return locale === "pt-BR" ? "Brazilian Portuguese" : "English";
  }

  const publisher = normalizePublisher(metadata.publisher || "").toLowerCase();
  const normalizedTitle = normalizeWhitespace(title).toLowerCase();
  if (
    publisher.includes("abril") ||
    publisher.includes("panini brasil") ||
    publisher.includes("pixel") ||
    normalizedTitle.includes("1ª série") ||
    normalizedTitle.includes("nº") ||
    normalizedTitle.includes("n°")
  ) {
    return "Brazilian Portuguese";
  }

  return "English";
}

function parseStructuredJson(text) {
  const raw = String(text || "").trim();
  if (!raw) {
    throw new Error("Model returned empty content");
  }

  const fencedMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fencedMatch ? fencedMatch[1].trim() : raw;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  const jsonText =
    start !== -1 && end !== -1 && end > start
      ? candidate.slice(start, end + 1)
      : candidate;

  return JSON.parse(jsonText);
}

function getMimeTypeFromResponse(response) {
  const header = String(
    response?.headers?.["content-type"] || "",
  ).toLowerCase();
  if (header.startsWith("image/")) {
    return header.split(";")[0];
  }

  return "image/jpeg";
}

async function fetchImageAsInlineData(imageUrl) {
  const response = await axios.get(imageUrl, {
    responseType: "arraybuffer",
    timeout: 20000,
    maxContentLength: 15 * 1024 * 1024,
    maxBodyLength: 15 * 1024 * 1024,
  });

  return {
    data: Buffer.from(response.data).toString("base64"),
    mimeType: getMimeTypeFromResponse(response),
  };
}

async function fetchSearchInfo(searchApiKey, searchQuery, log, logError) {
  if (!searchApiKey) {
    log("SERPER_SEARCH_API_KEY not configured. Skipping search enrichment.");
    return [];
  }

  const searchUrl = "https://google.serper.dev/search";
  log(`Searching for supporting comic info: ${searchQuery}`);

  try {
    const searchResponse = await axios.post(
      searchUrl,
      { q: searchQuery },
      {
        headers: {
          "X-API-KEY": searchApiKey,
          "Content-Type": "application/json",
        },
        timeout: 12000,
      },
    );

    const data = searchResponse.data || {};
    if (!Array.isArray(data.organic)) {
      return [];
    }

    return data.organic.slice(0, 3).map((item) => ({
      title: item.title || "",
      snippet: item.snippet || "",
      link: item.link || "",
    }));
  } catch (err) {
    const details = err.response?.data || err.message;
    logError("Serper Search API error details: " + JSON.stringify(details));
    return [];
  }
}

function getDescriptionLimits(mode, useImage) {
  const descriptionMode = String(mode || "long").toLowerCase();
  const isLong =
    descriptionMode === "long" ||
    descriptionMode === "full" ||
    descriptionMode === "detailed";

  return {
    isLong,
    minChars: isLong ? 600 : 0,
    maxChars: isLong ? 800 : 280,
  };
}

function buildImagePrompt({
  title,
  status,
  rating,
}) {
  return `Analyze this comic book cover and return only the comic identification details as JSON.

Constraints:
- Identify the main comic title from the cover text when it is clearly legible.
- Identify the issue number, volume number, or issue marker when it is clearly legible.
- Identify the total number of issues in the mini-series or special edition when that information is clearly legible.
- Identify the publisher/editor when that information is clearly legible.
- Identify whether this edition is Brazilian Portuguese ("pt-BR") or American English ("en-US").
- Identify whether the edition is a mini-series, special issue, annual, one-shot, or similar format when that is clearly legible.
- If a title is provided, use it only when it matches the visible cover and do not invent issue numbers, creators, publishers, or story details.
- If the title is not readable, return an empty string for "title".
- If the issue number is not readable, return an empty string for "issueNumber".
- If the total number of issues is not readable, return an empty string for "totalIssues".
- If the publisher is not readable, return an empty string for "publisher".
- If the locale is uncertain, infer it from the cover language and edition conventions. Return only "pt-BR" or "en-US".
- If the edition type is not readable, return an empty string for "editionType".
- Return only facts supported by the cover image.

Comic metadata:
Title: ${title || "Unknown"}
Status: ${status || "Unknown"}
${rating > 0 ? `Reader rating: ${rating}/5` : ""}

Return strict JSON only in this shape:
{
  "title": "string",
  "issueNumber": "string",
  "volume": "string",
  "totalIssues": "string",
  "publisher": "string",
  "locale": "pt-BR | en-US",
  "editionType": "string"
}`;
}

function buildTextPrompt({
  title,
  status,
  rating,
  isLong,
  minChars,
  maxChars,
  searchInfo,
  metadata,
  outputLanguage,
}) {
  const hasSearch = searchInfo.length > 0;
  const searchContext = hasSearch
    ? searchInfo
        .map((info) => `Source: ${info.title}\nInfo: ${info.snippet}`)
        .join("\n\n")
    : "";
  const metadataLines = [
    metadata?.volume ? `Volume: ${metadata.volume}` : "",
    metadata?.issueNumber ? `Issue Number: ${metadata.issueNumber}` : "",
    metadata?.totalIssues ? `Total Issues: ${metadata.totalIssues}` : "",
    metadata?.publisher ? `Publisher: ${metadata.publisher}` : "",
    metadata?.editionType ? `Edition Type: ${metadata.editionType}` : "",
    metadata?.locale ? `Edition Locale: ${metadata.locale}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return `Write a ${isLong ? "detailed" : "brief"}, engaging description for a comic book in ${outputLanguage}.

Constraints:
- ${isLong ? `Target length: ${minChars}-${maxChars} characters (including spaces). Do not exceed ${maxChars}.` : `Max length: ${maxChars} characters.`}
- Use the exact comic title provided, including the issue number when present, so the description matches that specific issue rather than the series in general.
- If the metadata indicates volume, total issue count, publisher, locale, or edition type, incorporate only the details supported by search results or the provided metadata.
- No spoilers.
- Do not invent facts. If details are unknown, keep it general.
- Avoid quoting or mentioning sources/search results.
- Keep it readable and inviting.

${isLong ? "Format: 3 short paragraphs.\n- Paragraph 1: hook + premise.\n- Paragraph 2: tone/genre + themes + what makes it compelling.\n- Paragraph 3: what a reader can expect + gentle call-to-read.\n" : "Format: 1-2 sentences.\n"}
Comic Details:
Title: ${title}
Status: ${status}
${rating > 0 ? `Rating: ${rating}/5` : ""}
${metadataLines ? `${metadataLines}\n` : ""}

${hasSearch ? `Verified info (use only if relevant and supported by these snippets):\n\n${searchContext}\n\n` : ""}
Return only the description text.`;
}

async function generateFromText({
  model,
  title,
  status,
  rating,
  mode,
  searchApiKey,
  log,
  logError,
  metadata = {},
}) {
  const normalizedMetadata = {
    issueNumber: clampIssueNumber(metadata.issueNumber || ""),
    volume: normalizeVolume(metadata.volume || ""),
    totalIssues: normalizeTotalIssues(metadata.totalIssues || ""),
    publisher: normalizePublisher(metadata.publisher || ""),
    locale: normalizeLocale(metadata.locale || ""),
    editionType: normalizeEditionType(metadata.editionType || ""),
  };
  const searchQuery = buildSearchQuery(title, normalizedMetadata);
  const searchInfo = await fetchSearchInfo(
    searchApiKey,
    searchQuery,
    log,
    logError,
  );
  const { isLong, minChars, maxChars } = getDescriptionLimits(mode, false);
  const outputLanguage = getOutputLanguage(normalizedMetadata, title);
  const prompt = buildTextPrompt({
    title,
    status,
    rating,
    isLong,
    minChars,
    maxChars,
    searchInfo,
    metadata: normalizedMetadata,
    outputLanguage,
  });

  const result = await model.generateContent(prompt);
  const response = await result.response;

  let description = isLong
    ? clampTextWithinRange(response.text(), minChars, maxChars)
    : clampText(response.text(), maxChars);

  if (!isLong) {
    return {
      title: clampTitle(title),
      description,
      mode: "short",
      maxChars,
      source: "title",
    };
  }

  let attempts = 0;
  while (description.length < minChars && attempts < 4) {
    attempts += 1;
    log(
      `Text description too short (${description.length} chars). Expanding (attempt ${attempts})...`,
    );

    const expandPrompt = `Expand the following comic description to be between ${minChars} and ${maxChars} characters (including spaces).

Rules:
- Keep the same facts; do not add new factual claims (no new names, events, publishers, creators, dates).
- You may elaborate only in general terms (tone, atmosphere, stakes, themes, reading experience).
- No spoilers.
- Keep 3 short paragraphs.
- Do not mention sources/search results.
- Must be at least ${minChars} characters and must not exceed ${maxChars}.

Original description:
"""
${description}
"""`;

    const expandResult = await model.generateContent(expandPrompt);
    const expandResponse = await expandResult.response;
    description = clampTextWithinRange(
      expandResponse.text(),
      minChars,
      maxChars,
    );
  }

  if (description.length < minChars || description.length > maxChars) {
    log(
      `Text description out of bounds (${description.length}). Forcing strict rewrite to ${minChars}-${maxChars}...`,
    );

    const strictPrompt = `Rewrite the following into exactly 3 short paragraphs and ensure the result is between ${minChars} and ${maxChars} characters (including spaces).

Rules:
- No spoilers.
- Do not invent facts; keep it general where facts are unknown.
- Do not mention sources/search results.
- Must be within range.

Input:
"""
${description}
"""`;

    const strictResult = await model.generateContent(strictPrompt);
    const strictResponse = await strictResult.response;
    description = clampTextWithinRange(
      strictResponse.text(),
      minChars,
      maxChars,
    );
  }

  return {
    title: clampTitle(title),
    description,
    mode: "long",
    maxChars,
    source: "title",
  };
}

async function extractComicMetadataFromImage({
  model,
  imageUrl,
  title,
  status,
  rating,
}) {
  const { data, mimeType } = await fetchImageAsInlineData(imageUrl);
  const prompt = buildImagePrompt({
    title,
    status,
    rating,
    isLong: true,
    minChars: 600,
    maxChars: 800,
  });

  const result = await model.generateContent([
    prompt,
    {
      inlineData: {
        mimeType,
        data,
      },
    },
  ]);
  const response = await result.response;
  const parsed = parseStructuredJson(response.text());
  const metadata = {
    title: clampTitle(parsed?.title || title || ""),
    issueNumber: clampIssueNumber(parsed?.issueNumber || ""),
    volume: normalizeVolume(parsed?.volume || ""),
    totalIssues: normalizeTotalIssues(parsed?.totalIssues || ""),
    publisher: normalizePublisher(parsed?.publisher || ""),
    locale: normalizeLocale(parsed?.locale || ""),
    editionType: normalizeEditionType(parsed?.editionType || ""),
  };

  return {
    ...metadata,
    resolvedTitle: buildResolvedTitle(metadata, title || ""),
  };
}

module.exports = async function ({ req, res, log, error: logError }) {
  const apiKey = process.env.GEMINI_API_KEY;
  const searchApiKey = process.env.SERPER_SEARCH_API_KEY;
  const modelName = process.env.GEMINI_MODEL || "gemini-2.5-flash";

  if (!apiKey) {
    const errorMsg = "Missing environment variables: GEMINI_API_KEY";
    logError(errorMsg);
    return res.json({
      success: false,
      error: errorMsg,
    });
  }

  log(`Configuration:
    Search API Key: ${searchApiKey ? `${searchApiKey.substring(0, 8)}...` : "not set"}
    Model Name: ${modelName}
  `);

  let payload;
  try {
    payload = JSON.parse(req.body || "{}");
    log("Received payload: " + JSON.stringify(payload));
  } catch (err) {
    logError("Failed to parse request payload: " + err.message);
    return res.json({
      success: false,
      error: "Invalid request format",
    });
  }

  const { title, status, rating, mode, coverImage, imageUrl } = payload;
  const normalizedTitle = String(title || "").trim();
  const normalizedStatus = String(status || "").trim();
  const normalizedImageUrl = String(coverImage || imageUrl || "").trim();
  const numericRating = parseInt(rating, 10) || 0;

  if (!normalizedTitle && !normalizedImageUrl) {
    logError("Missing required fields: provide title and/or cover image URL");
    return res.json({
      success: false,
      error: "Missing required fields: provide title and/or cover image URL.",
    });
  }

  if (!normalizedStatus) {
    logError("Missing required field: status");
    return res.json({
      success: false,
      error: "Missing required field: status.",
    });
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: modelName });

    let resolvedTitle = normalizedTitle;
    let resolvedMetadata = {};
    if (normalizedImageUrl) {
      try {
        log("Extracting comic metadata from cover image...");
        const extracted = await extractComicMetadataFromImage({
          model,
          imageUrl: normalizedImageUrl,
          title: normalizedTitle,
          status: normalizedStatus,
          rating: numericRating,
        });
        resolvedMetadata = {
          issueNumber: extracted.issueNumber,
          volume: extracted.volume,
          totalIssues: extracted.totalIssues,
          publisher: extracted.publisher,
          locale: extracted.locale,
          editionType: extracted.editionType,
        };

        if (extracted.resolvedTitle) {
          resolvedTitle = extracted.resolvedTitle;
          log(`Resolved title from cover image: ${resolvedTitle}`);
        }
      } catch (imageError) {
        logError(
          `Image-based metadata extraction failed: ${imageError.message || imageError}`,
        );

        if (!normalizedTitle) {
          throw imageError;
        }

        log("Falling back to title-based generation.");
      }
    }

    if (!resolvedTitle) {
      throw new Error("Could not determine a comic title from the provided cover");
    }

    const result = await generateFromText({
      model,
      title: resolvedTitle,
      status: normalizedStatus,
      rating: numericRating,
      mode,
      searchApiKey,
      log,
      logError,
      metadata: resolvedMetadata,
    });

    log("Generated description: " + result.description);

    return res.json({
      success: true,
      title: result.title || clampTitle(resolvedTitle),
      description: result.description,
      mode: result.mode,
      maxChars: result.maxChars,
      source: normalizedImageUrl ? "title-via-cover" : result.source,
    });
  } catch (err) {
    const errorMessage = err?.message || String(err);
    logError("Error detail: " + JSON.stringify(err));
    logError(`Error generating description: ${errorMessage}`);

    return res.json({
      success: false,
      error:
        err.response?.data?.error?.message ||
        err.message ||
        "Failed to generate description",
    });
  }
};
