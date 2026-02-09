# 🦸‍♂️ Comics AI Description Generator

An Appwrite Cloud Function that automatically generates engaging descriptions for your comic books using Google's Gemini AI and SERPER web search data! 🚀

## 🎯 Features

- 🤖 Uses Gemini AI for creative and contextual descriptions
- 🔍 Incorporates real-world information via SERPER (Serper.dev)
- ⚡ Complete and broad descriptions up to 2000 characters
- 📚 Works with any comic book title

## 🛠️ Setup

### Prerequisites

- 🔑 Google Gemini API Key
- 🔎 SERPER Search API Key (set as `SERPER_SEARCH_API_KEY`)
- ☁️ Appwrite Account

### Environment Variables

Set these in your Appwrite Console under Functions > comics_ai_description > Variables:

```bash
GEMINI_API_KEY=your_gemini_api_key
SERPER_SEARCH_API_KEY=your_serper_search_api_key
# Optional: specify a Gemini model (defaults to gemini-pro)
GEMINI_MODEL=gemini-pro
```

## 🚀 Usage

The function expects a JSON payload with the following structure:

```json
{
  "title": "Comic Title",
  "status": "published",
  "rating": 4,
  "mode": "long"
}
```

Fields:

- `title` (string, required)
- `status` (string, required) — e.g., "published", "draft"
- `rating` (number, optional) — 0–5
- `mode` (string, optional) — "short" or "long" (default: "long")

### Response Format

```json
{
  "success": true,
  "description": "Generated description for your comic",
  "mode": "long",
  "maxChars": 2000
}
```

## 🔄 Integration

This function can be triggered:

- 📝 On document creation in comics collection
- 🔄 On document update in comics collection
- 🌐 Via HTTP request

## 📋 Example

Input:

```json
{
  "title": "Batman: Year One"
}
```

Output:

```json
{
  "success": true,
  "description": "In 'Batman: Year One', witness the origin story of Gotham's Dark Knight. Follow Bruce Wayne's transformation from a grieving billionaire to a relentless vigilante. Experience the gritty streets of Gotham, the rise of crime, and the birth of Batman as he battles corruption and forms an unlikely alliance with rookie cop James Gordon. A gripping tale of courage, justice, and redemption that redefines the superhero genre.",
  "mode": "long",
  "maxChars": 2000
}
```

## ⚠️ Error Handling

The function includes robust error handling for:

- 🔒 Missing API keys
- 📡 Failed search requests (SERPER errors are logged; the function will continue)
- 🤖 AI generation issues
- 📄 Invalid input data

## � Development

Run locally for quick iteration:

1. Install dependencies:
  
```bash
npm install
```

2. Create a `.env` file in the project root with these variables:

```bash
GEMINI_API_KEY=your_gemini_api_key
SERPER_SEARCH_API_KEY=your_serper_search_api_key
# Optional: GEMINI_MODEL (defaults to gemini-pro)
GEMINI_MODEL=gemini-2.5-flash || gemini-3-flash-preview
```

3. Run the local tester:

```bash
node test-local.js
```

This script will load `.env`, invoke the function, and print the structured JSON response to stdout.

**Debugging tips:**

- Check `SERPER_SEARCH_API_KEY` validity if search results are empty.
- Use `console.log` in `index.js` to inspect prompts and API responses.

## �🤝 Contributing

Feel free to contribute to this project! Open issues and pull requests are welcome. 🎉
