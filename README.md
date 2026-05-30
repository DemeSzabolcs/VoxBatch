# Vox Batch

![GitHub last commit](https://img.shields.io/github/last-commit/DemeSzabolcs/VoxBatch) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## About
Vox Batch is a small local fully vibe-coded web app for batch-generating text-to-speech audio files with the [ElevenLabs](https://elevenlabs.io/) API.

The point of the app is to make repeated TTS generation faster when you have a longer script that should be split into named sections and chunks. Instead of copying text into ElevenLabs one part at a time, you can upload a structured `.txt` file, choose a voice and generation settings, select the script segments you want, and download the generated audio files in one ZIP.

Typical use cases:
- YouTube narration scripts.
- Short-form video scripts.
- Podcast or voiceover drafts.
- Batch-generating multiple takes of each script chunk.
- Creating organized audio files from a segmented script.

The app runs locally on your machine. It opens a browser UI, sends requests to ElevenLabs using the API key you provide, and creates a ZIP file with the generated audio.

## Important disclaimer
Use this app at your own risk.

I do not take any responsibility for errors, failed generations, wrong files, unexpected API usage, lost credits, bad output, incorrect estimates, bugs, crashes, or any other issue caused directly or indirectly by using this app.

Always check the estimated credit usage before generating. The app tries to estimate usage from character counts, but ElevenLabs billing or API behavior can change, and the estimate should not be treated as a guarantee.

## AI-built disclosure
No human manually wrote or edited the application code.

The logo was created with **Canva Dream Lab**.  
The code was generated with **Claude Code** and **Codex**.

## Getting started
### Requirements
- Python 3.
- An ElevenLabs account.
- An ElevenLabs API key.
- Internet connection while loading voices, checking credits, and generating audio.

No NuGet package, npm install, build step, or external Python package installation is needed.

### Running the app
1. Clone or download this repository.
2. Open a terminal in the repository folder.
3. Run:

```bash
python app.py
```

4. The app starts a local server at:

```text
http://localhost:7842
```

5. Your browser should open automatically. If it does not, open the URL manually.

On Windows, you can also run:

```text
Vox Batch.bat
```

## Usage
### 1. Prepare your script file
Create a `.txt` file and split it into segments with hashtag headings.

Each segment must start with a line like:

```text
# Hook
```

Example:

```text
# Hook
This is the opening part of the script.

# Main
This is the main section. It can contain multiple sentences.

# Outro
This is the closing section.
```

Only single-hashtag headings start new segments. The text under each heading belongs to that segment until the next heading.

### 2. Enter your ElevenLabs API key
Paste your ElevenLabs API key into the API key field.

The app does not save the API key into `settings.json`. It is used in the current browser session to load voices, check credits, and generate audio.

### 3. Load voices
Click **Load voices**.

The app will:
- Load your available ElevenLabs voices.
- Restore your last selected voice if it is still available.
- Load your current credit usage and credit limit.
- Show remaining credits when available.

### 4. Choose voice and model
Select the voice you want to use.

Choose the model:
- **Eleven v3**
- **Multilingual v2**
- **Turbo v2.5**
- **Turbo v2**
- **Monolingual v1**

The available models in the UI are intentionally simple and predefined.

### 5. Adjust voice settings
You can adjust:
- **Speed**: Speaking speed.
- **Stability**: Higher values make the voice more consistent.
- **Similarity**: Higher values keep the result closer to the selected voice.
- **Style Exaggeration**: Adds more style and expression when supported.
- **Speaker Boost**: Enhances clarity and similarity for some voices.

Settings are saved per voice. You can reset the current voice to defaults with **Reset voice settings**.

### 6. Configure output settings
Choose:
- Output audio format.
- Versions per chunk.
- ZIP filename.
- Filename pattern.
- Whether to include a `manifest.json`.

The default filename pattern is:

```text
hook_01_take_01.mp3
```

This means:
- `hook`: segment name.
- `01`: chunk number.
- `take_01`: generated version/take.

### 7. Upload the script
Drag a `.txt` file into the upload area or click the upload box.

After upload, the app will:
- Parse segments from `# Heading` lines.
- Split segment text into chunks based on the max character limit.
- Show segment count, total generated files, character count, and estimated credits.
- Show a warning if no valid segments are found.

### 8. Review and edit segments
Each segment can be selected or unselected.

You can:
- Select all segments.
- Select none.
- Use the master checkbox.
- Preview each segment.
- Edit the segment name.
- Edit each chunk before generation.

The preview is hidden by default and can be opened per segment.

### 9. Character limit and automatic re-parse
The **Max characters per segment chunk** field controls how long each generated text chunk can be.

When you change the character limit, the uploaded script is automatically parsed again with the new limit.

### 10. Credit estimate
The app estimates generation usage like this:

```text
selected characters x versions per chunk
```

Because this app uses the ElevenLabs API, every generated take costs credits. The ElevenLabs web app may let you regenerate the same speech a limited number of times for free, but that does not apply here.

If your ElevenLabs credit data is loaded, the app also estimates how many credits would remain after the run.

If the estimated usage is higher than your remaining credits, the app asks for confirmation before generating.

### 11. Large run confirmation
If the app is about to generate more than 50 files, it asks for confirmation.

This helps avoid accidentally creating a large number of ElevenLabs requests.

### 12. Generate audio
Click **Generate & Download ZIP**.

During generation, the app shows:
- Progress log.
- Success/failure per file.
- Progress bar.
- Cancel button.

The selected voice name is also written into the log.

### 13. Cancel generation
Click **Cancel generation** to request cancellation.

Cancellation is best-effort. If a request is already in progress, it may finish before the app stops the next one.

### 14. Download ZIP
When generation finishes, the app downloads a ZIP file.

The ZIP can contain:
- Generated audio files.
- Optional `manifest.json`.

The manifest includes generation metadata such as segment names, chunk numbers, take numbers, character counts, output format, model, voice settings, success state, and errors when available.

## Project structure
```text
Vox Batch/
  app.py
  settings.json
  Vox Batch.bat
  static/
    index.html
    style.css
    app.js
    logo.png
    favicon.png
```

### `app.py`
The local Python server. It serves the UI, stores non-secret settings, proxies requests to ElevenLabs, creates ZIP files, and handles downloads.

### `static/index.html`
The HTML structure of the UI.

### `static/style.css`
The app styling.

### `static/app.js`
The browser-side app logic.

### `settings.json`
Stores non-secret preferences such as output format, versions, max characters, filename pattern, last voice, and per-voice settings.

The API key is not saved here.

## Settings and privacy
Vox Batch runs locally, but it must communicate with ElevenLabs to:
- Load voices.
- Check subscription/credit data.
- Generate audio.

Your script text is sent to ElevenLabs when generating audio. Do not use the app with text you are not allowed to send to ElevenLabs.

The app does not intentionally send your data anywhere else.

## Known limitations
- Credit usage is only an estimate.
- Every API generation costs ElevenLabs credits. The ElevenLabs web app may allow a couple of free regenerations for the same speech, but API-based generations in this app do not get those free retries.
- Cancel generation is best-effort.
- The app uses Python's built-in HTTP server and is intended for local use.
- It is not designed for hosting on the public internet.
- Error handling is basic.
- ElevenLabs API behavior, models, output formats, or billing rules may change.

## Used tools
- [ElevenLabs](https://elevenlabs.io/): Text-to-speech API.
- [Canva Dream Lab](https://www.canva.com/): Logo generation.
- Claude Code: Code generation.
- Codex: Code generation and project structuring.

## License
If a license file is included in this repository, the project is licensed under that license.

Third-party services and tools are provided under their own terms and licenses.

## Support me
If you want to support me and my work, consider sponsoring me on GitHub. :)

[![GitHub Sponsors](https://img.shields.io/badge/Sponsor-GitHub-ff69b4?logo=github&style=flat)](https://github.com/sponsors/DemeSzabolcs)

All support is appreciated!

If you would like to work with me, feel free to contact me via email.  
My business email address is available in my [GitHub bio](https://github.com/DemeSzabolcs).
