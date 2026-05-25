let segments = [];
let creditsInfo = null;
let lastScriptText = '';
let lastScriptName = '';
let generationController = null;
let settingsToastTimer = null;

function byId(id) { return document.getElementById(id); }
function formatNumber(value) { return Number(value || 0).toLocaleString('en-US'); }
function setValueText(id, value, suffix) { byId(id).textContent = value + suffix; }
function getNumberInput(id, fallback) {
  return parseInt(byId(id).value, 10) || fallback;
}
function setText(id, text) { byId(id).textContent = text; }

const dropArea = byId('dropArea');
dropArea.addEventListener('dragover', event => { event.preventDefault(); dropArea.classList.add('over'); });
dropArea.addEventListener('dragleave', () => dropArea.classList.remove('over'));
dropArea.addEventListener('drop', event => { event.preventDefault(); dropArea.classList.remove('over'); handleFile(event.dataTransfer.files[0]); });

function handleFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = event => parseScript(event.target.result, file.name, true);
  reader.readAsText(file, 'utf-8');
}

function parseScript(text, fileName, remember=false) {
  if (remember) {
    lastScriptText = text;
    lastScriptName = fileName;
  }
  byId('dropMain').textContent = fileName;
  byId('dropSub').textContent = 'Parsed successfully';
  const maxChars = getNumberInput('maxChars', 500);
  const lines = text.split('\n');
  const rawSegments = [];
  let current = null;
  for (const line of lines) {
    const trimmedLine = line.trim();
    if (trimmedLine.startsWith('# ') && trimmedLine.length > 2) {
      if (current) rawSegments.push(current);
      current = { name: trimmedLine.slice(2).trim(), text: '' };
    } else if (current && trimmedLine) {
      // Preserve sentence boundaries: join with space but keep paragraph breaks as '. ' if no punctuation
      if (current.text && !/[.!?]$/.test(current.text.trimEnd())) {
        current.text += ' ' + trimmedLine;
      } else {
        current.text += (current.text ? ' ' : '') + trimmedLine;
      }
    }
  }
  if (current) rawSegments.push(current);
  segments = [];
  for (const segment of rawSegments) {
    const segmentText = segment.text.trim();
    if (!segmentText) continue;
    segments.push({ name: segment.name, parts: splitText(segmentText, maxChars), selected: true });
  }
  byId('emptyState').style.display = segments.length ? 'none' : 'block';
  renderSegments();
  checkReady();
}

function reparseCurrentScript() {
  if (lastScriptText) parseScript(lastScriptText, lastScriptName, false);
}

function splitText(text, maxLen) {
  // Split into sentences (keep delimiter attached)
  const sentenceRe = /[^.!?]+[.!?]+["']?\s*/g;
  let sentences = [];
  let match;
  let lastIndex = 0;
  while ((match = sentenceRe.exec(text)) !== null) {
    sentences.push(match[0]);
    lastIndex = match.index + match[0].length;
  }
  // Any trailing text that didn't end with punctuation
  if (lastIndex < text.length) {
    sentences.push(text.slice(lastIndex));
  }
  // If no sentences detected, fall back to the whole text
  if (sentences.length === 0) return [text];

  const parts = [];
  let current = '';

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i];
    const isLast = i === sentences.length - 1;
    const candidate = current ? current + sentence : sentence;

    if (candidate.trim().length <= maxLen) {
      // Fits within limit — always accept
      current = candidate;
    } else {
      // Would exceed limit
      if (current === '') {
        // Single sentence longer than limit: accept anyway (no good split point)
        current = candidate;
      } else if (isLast) {
        // Last sentence of segment: allow it to exceed the limit
        current = candidate;
      } else {
        // More sentences follow: close current chunk, start new one with this sentence
        parts.push(current.trim());
        current = sentence;
      }
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function renderSegments() {
  const versions = getNumberInput('versions', 2);
  const segmentList = byId('segList');
  segmentList.innerHTML = '';

  // Toolbar: select all / none — only shown when there are segments to act on
  if (segments.length > 0) {
    const toolbar = document.createElement('div');
    toolbar.className = 'seg-toolbar';
    const masterLabel = document.createElement('label');
    masterLabel.className = 'seg-master';
    const masterCheck = document.createElement('input');
    masterCheck.type = 'checkbox';
    masterCheck.checked = segments.every(segment => segment.selected);
    masterCheck.indeterminate = segments.some(segment => segment.selected) && !segments.every(segment => segment.selected);
    masterCheck.addEventListener('change', () => setAllSegments(masterCheck.checked));
    const masterText = document.createElement('span');
    masterText.textContent = 'All segments';
    masterLabel.appendChild(masterCheck);
    masterLabel.appendChild(masterText);
    const selectAll = document.createElement('button');
    selectAll.type = 'button';
    selectAll.textContent = 'Select all';
    selectAll.addEventListener('click', () => setAllSegments(true));
    const selectNone = document.createElement('button');
    selectNone.type = 'button';
    selectNone.textContent = 'Select none';
    selectNone.addEventListener('click', () => setAllSegments(false));
    toolbar.appendChild(masterLabel);
    toolbar.appendChild(selectAll);
    toolbar.appendChild(selectNone);
    segmentList.appendChild(toolbar);
  }

  segments.forEach((seg, idx) => {
    const segmentItem = document.createElement('div');
    segmentItem.className = 'seg-item' + (seg.selected ? '' : ' disabled');
    const files = seg.parts.length * versions;
    const chars = seg.parts.reduce((a,p)=>a+p.length,0);
    const main = document.createElement('div');
    main.className = 'seg-main';
    const left = document.createElement('div');
    left.className = 'seg-left';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'seg-check';
    checkbox.checked = !!seg.selected;
    checkbox.addEventListener('change', () => toggleSegment(idx, checkbox.checked));
    const name = document.createElement('span');
    name.className = 'seg-name';
    name.textContent = seg.name;
    const meta = document.createElement('div');
    meta.className = 'seg-meta';
    const charBadge = document.createElement('span');
    charBadge.className = 'badge';
    charBadge.textContent = chars.toLocaleString('en-US') + ' chars';
    const fileBadge = document.createElement('span');
    fileBadge.className = 'badge';
    fileBadge.textContent = files + ' file' + (files !== 1 ? 's' : '');
    const previewBtn = document.createElement('button');
    previewBtn.type = 'button';
    previewBtn.className = 'seg-preview-btn';
    previewBtn.textContent = 'Preview';
    const preview = document.createElement('div');
    preview.className = 'seg-preview';
    const nameLabel = document.createElement('label');
    nameLabel.textContent = 'Segment name';
    const nameInput = document.createElement('input');
    nameInput.className = 'seg-edit-name';
    nameInput.value = seg.name;
    nameInput.addEventListener('input', () => {
      seg.name = nameInput.value.trim() || 'Untitled';
      name.textContent = seg.name;
    });
    preview.appendChild(nameLabel);
    preview.appendChild(nameInput);
    seg.parts.forEach((part, partIdx) => {
      const chunkLabel = document.createElement('label');
      chunkLabel.textContent = `Chunk ${partIdx + 1} (${part.length.toLocaleString('en-US')} chars)`;
      const area = document.createElement('textarea');
      area.className = 'seg-edit-text';
      area.value = part;
      area.addEventListener('input', () => {
        seg.parts[partIdx] = area.value;
        chunkLabel.textContent = `Chunk ${partIdx + 1} (${area.value.length.toLocaleString('en-US')} chars)`;
        const updatedChars = seg.parts.reduce((a,p)=>a+p.length,0);
        charBadge.textContent = updatedChars.toLocaleString('en-US') + ' chars';
        updateStats();
      });
      preview.appendChild(chunkLabel);
      preview.appendChild(area);
    });
    previewBtn.addEventListener('click', () => {
      const open = preview.classList.toggle('open');
      previewBtn.textContent = open ? 'Hide' : 'Preview';
    });
    left.appendChild(checkbox);
    left.appendChild(name);
    meta.appendChild(charBadge);
    meta.appendChild(fileBadge);
    meta.appendChild(previewBtn);
    main.appendChild(left);
    main.appendChild(meta);
    segmentItem.appendChild(main);
    segmentItem.appendChild(preview);
    segmentList.appendChild(segmentItem);
  });

  updateStats();
  checkReady();
}

function updateStats() {
  if (!segments.length) {
    byId('statsBox').style.display = 'none';
    updateCreditEstimate();
    return;
  }
  const { selectedSegments, totalFiles, totalChars, estimatedCredits } = getGenerationEstimate();
  byId('statSegs').textContent = selectedSegments.length;
  byId('statParts').textContent = totalFiles;
  byId('statChars').textContent = formatNumber(totalChars);
  byId('statCredits').textContent = formatNumber(estimatedCredits);
  byId('statsBox').style.display = 'grid';
  updateCreditEstimate();
}

function updateCreditEstimate() {
  const box = byId('creditEstimateBox');
  if (!segments.length) {
    box.style.display = 'none';
    return;
  }
  const { estimatedCredits } = getGenerationEstimate();
  byId('creditEstimate').textContent = formatNumber(estimatedCredits);
  const remainingEl = byId('creditEstimateRemaining');
  if (creditsInfo && Number.isFinite(creditsInfo.remaining)) {
    const after = creditsInfo.remaining - estimatedCredits;
    remainingEl.textContent = ' · ' + formatNumber(Math.max(after, 0)) + ' remaining after run';
    remainingEl.className = after < 0 ? 'err' : '';
  } else {
    remainingEl.textContent = '';
    remainingEl.className = '';
  }
  box.style.display = 'block';
}

function toggleSegment(idx, checked) {
  if (segments[idx]) segments[idx].selected = checked;
  renderSegments();
}

function setAllSegments(value) {
  segments.forEach(segment => segment.selected = value);
  renderSegments();
}

function checkReady() {
  const anySelected = segments.some(segment => segment.selected);
  byId('genBtn').disabled = !(anySelected && byId('voiceSelect').value);
}

// In-memory cache of settings — written back after every change.
// Structure:
// {
//   output_format, versions, max_chars, last_voice_id,
//   voice_settings: { <voice_id>: { model_id, speed, stability, similarity, style_exaggeration, speaker_boost } }
// }
let settingsCache = { voice_settings: {} };

const VOICE_DEFAULTS = {
  model_id: 'eleven_multilingual_v2',
  speed: '100',
  stability: '50',
  similarity: '75',
  style_exaggeration: '0',
  speaker_boost: true
};

function getCurrentVoiceId() {
  return byId('voiceSelect').value || '';
}

function readVoiceControlsFromUI() {
  return {
    model_id: byId('modelSelect').value,
    speed: byId('speed').value,
    stability: byId('stability').value,
    similarity: byId('similarity').value,
    style_exaggeration: byId('styleExag').value,
    speaker_boost: byId('speakerBoost').checked
  };
}

function applyVoiceControlsToUI(vs) {
  byId('modelSelect').value = vs.model_id;
  byId('speed').value = vs.speed;
  setValueText('speedVal', vs.speed, '%');
  byId('stability').value = vs.stability;
  setValueText('stabVal', vs.stability, '%');
  byId('similarity').value = vs.similarity;
  setValueText('simVal', vs.similarity, '%');
  byId('styleExag').value = vs.style_exaggeration;
  setValueText('styleVal', vs.style_exaggeration, '%');
  byId('speakerBoost').checked = !!vs.speaker_boost;
}

function sameVoiceSettings(a, b) {
  return !!a && !!b &&
    String(a.model_id) === String(b.model_id) &&
    String(a.speed) === String(b.speed) &&
    String(a.stability) === String(b.stability) &&
    String(a.similarity) === String(b.similarity) &&
    String(a.style_exaggeration) === String(b.style_exaggeration) &&
    !!a.speaker_boost === !!b.speaker_boost;
}

function updateVoiceStatus(text) {
  byId('voiceStatus').textContent = text;
}

function buildSettingsPayload() {
  // Snapshot current voice's UI values into cache before persisting
  const vid = getCurrentVoiceId();
  if (vid) {
    if (!settingsCache.voice_settings) settingsCache.voice_settings = {};
    settingsCache.voice_settings[vid] = readVoiceControlsFromUI();
    settingsCache.last_voice_id = vid;
  }
  settingsCache.output_format = byId('outputFormat').value;
  settingsCache.versions = byId('versions').value;
  settingsCache.max_chars = byId('maxChars').value;
  settingsCache.zip_filename = byId('zipFilename').value;
  settingsCache.filename_pattern = byId('filenamePattern').value;
  settingsCache.include_manifest = byId('includeManifest').checked;
  return settingsCache;
}

function showToast(message='Settings saved') {
  const toast = byId('toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(settingsToastTimer);
  settingsToastTimer = setTimeout(() => toast.classList.remove('show'), 1600);
}

async function saveSettings() {
  try {
    const payload = buildSettingsPayload();
    await fetch('/api/settings', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
    showToast('Settings saved');
  } catch(error) {}
}

async function loadSettings() {
  try {
    const res = await fetch('/api/settings');
    if (!res.ok) return;
    const savedSettings = await res.json();
    settingsCache = savedSettings || {};
    if (!settingsCache.voice_settings) settingsCache.voice_settings = {};

    // Legacy migration: if old flat per-voice fields exist at the top level
    // and we know which voice they belonged to, fold them into voice_settings.
    const legacyKeys = ['model_id','speed','stability','similarity','style_exaggeration','speaker_boost'];
    const hasLegacy = legacyKeys.some(key => savedSettings && savedSettings[key] !== undefined);
    if (hasLegacy && savedSettings.last_voice_id && !settingsCache.voice_settings[savedSettings.last_voice_id]) {
      settingsCache.voice_settings[savedSettings.last_voice_id] = {
        model_id: savedSettings.model_id || VOICE_DEFAULTS.model_id,
        speed: savedSettings.speed !== undefined ? savedSettings.speed : VOICE_DEFAULTS.speed,
        stability: savedSettings.stability !== undefined ? savedSettings.stability : VOICE_DEFAULTS.stability,
        similarity: savedSettings.similarity !== undefined ? savedSettings.similarity : VOICE_DEFAULTS.similarity,
        style_exaggeration: savedSettings.style_exaggeration !== undefined ? savedSettings.style_exaggeration : VOICE_DEFAULTS.style_exaggeration,
        speaker_boost: savedSettings.speaker_boost !== undefined ? savedSettings.speaker_boost : VOICE_DEFAULTS.speaker_boost
      };
    }

    if (savedSettings.output_format) byId('outputFormat').value = savedSettings.output_format;
    if (savedSettings.versions !== undefined) byId('versions').value = savedSettings.versions;
    if (savedSettings.max_chars !== undefined) byId('maxChars').value = savedSettings.max_chars;
    if (savedSettings.zip_filename) byId('zipFilename').value = savedSettings.zip_filename;
    if (savedSettings.filename_pattern) byId('filenamePattern').value = savedSettings.filename_pattern;
    if (savedSettings.include_manifest !== undefined) byId('includeManifest').checked = !!savedSettings.include_manifest;

    // Voice-scoped controls: if we have any saved per-voice settings (legacy or
    // last_voice_id), preload the UI so the user sees something sensible before
    // voices are loaded. Otherwise show defaults.
    let preload = null;
    if (savedSettings.last_voice_id && settingsCache.voice_settings[savedSettings.last_voice_id]) {
      preload = settingsCache.voice_settings[savedSettings.last_voice_id];
    }
    applyVoiceControlsToUI(preload || VOICE_DEFAULTS);
    updateVoiceStatus(preload && !sameVoiceSettings(preload, VOICE_DEFAULTS) ? 'Saved for this voice' : 'Defaults loaded');
  } catch(error) {}
}

// Called when the user changes any voice-scoped control (model, sliders, boost).
// Writes the current UI values under the active voice id and persists.
function onVoiceSettingChanged() {
  const vid = getCurrentVoiceId();
  if (vid) {
    if (!settingsCache.voice_settings) settingsCache.voice_settings = {};
    settingsCache.voice_settings[vid] = readVoiceControlsFromUI();
    updateVoiceStatus('Saved for this voice');
  } else {
    updateVoiceStatus('Defaults loaded');
  }
  saveSettings();
}

// Called when the voice dropdown changes. Loads the saved per-voice settings
// (or defaults) into the UI without overwriting any other voice's stored values.
function onVoiceChanged() {
  const vid = getCurrentVoiceId();
  if (vid) {
    const vs = (settingsCache.voice_settings && settingsCache.voice_settings[vid]) || VOICE_DEFAULTS;
    applyVoiceControlsToUI(vs);
    settingsCache.last_voice_id = vid;
    updateVoiceStatus(sameVoiceSettings(vs, VOICE_DEFAULTS) ? 'Defaults loaded' : 'Saved for this voice');
    saveSettings();
  }
  checkReady();
}

function resetVoiceSettings() {
  applyVoiceControlsToUI(VOICE_DEFAULTS);
  const vid = getCurrentVoiceId();
  if (vid) {
    if (!settingsCache.voice_settings) settingsCache.voice_settings = {};
    settingsCache.voice_settings[vid] = readVoiceControlsFromUI();
    settingsCache.last_voice_id = vid;
  }
  updateVoiceStatus('Defaults loaded');
  saveSettings();
}

document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  // Global (not per-voice) controls — saved as-is
  ['apiKey','outputFormat','versions','maxChars','zipFilename','filenamePattern'].forEach(id =>
    byId(id).addEventListener('change', saveSettings)
  );
  byId('includeManifest').addEventListener('change', saveSettings);
  byId('versions').addEventListener('input', () => { if (segments.length) renderSegments(); });
  byId('maxChars').addEventListener('input', () => { reparseCurrentScript(); });
  // Per-voice controls — saved under the currently selected voice id
  ['modelSelect','speed','stability','similarity','styleExag'].forEach(id =>
    byId(id).addEventListener('change', onVoiceSettingChanged)
  );
  byId('speakerBoost').addEventListener('change', onVoiceSettingChanged);
});

async function loadVoices() {
  const key = byId('apiKey').value.trim();
  if (!key) { alert('Please enter your API key.'); return; }
  const btn = byId('loadVoicesBtn');
  btn.disabled = true;
  btn.textContent = 'Loading...';
  try {
    const res = await fetch('/api/voices', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({api_key: key}) });
    const data = await res.json();
    if (data.error) { alert('Error: ' + data.error); return; }
    const voiceSelect = byId('voiceSelect');
    voiceSelect.replaceChildren();
    data.voices.forEach(voice => {
      const opt = document.createElement('option');
      opt.value = voice.id;
      opt.textContent = voice.name;
      voiceSelect.appendChild(opt);
    });
    // Restore previously selected voice if it still exists, then load its settings
    if (settingsCache.last_voice_id && data.voices.some(voice => voice.id === settingsCache.last_voice_id)) {
      voiceSelect.value = settingsCache.last_voice_id;
    }
    onVoiceChanged();
    log('Voices loaded: ' + data.voices.length, 'ok');
    loadCredits(key);
    saveSettings();
  } catch(error) { alert('Network error: ' + error.message); }
  finally {
    btn.disabled = false;
    btn.textContent = 'Load voices';
  }
}

async function loadCredits(apiKey) {
  const box = byId('creditsBox');
  box.style.display = 'block';
  setText('creditsUsed', 'Loading credits...');
  setText('creditsLimit', '');
  setText('creditsRemaining', '');
  try {
    const res = await fetch('/api/subscription', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({api_key: apiKey}) });
    const data = await res.json();
    if (data.error) {
      creditsInfo = null;
      box.style.display = 'block';
      setText('creditsUsed', 'Credits unavailable');
      setText('creditsLimit', '');
      setText('creditsRemaining', ' · ' + data.error);
      return;
    }
    const remaining = Math.max((data.character_limit || 0) - (data.character_count || 0), 0);
    creditsInfo = {
      character_count: data.character_count || 0,
      character_limit: data.character_limit || 0,
      remaining
    };
    setText('creditsUsed', formatNumber(data.character_count));
    setText('creditsLimit', formatNumber(data.character_limit));
    setText('creditsRemaining', ' · ' + formatNumber(remaining) + ' remaining');
    box.style.display = 'block';
    updateCreditEstimate();
  } catch(error) {
    creditsInfo = null;
    const box = byId('creditsBox');
    box.style.display = 'block';
    setText('creditsUsed', 'Credits unavailable');
    setText('creditsLimit', '');
    setText('creditsRemaining', ' · ' + error.message);
  }
}

function log(msg, type='') {
  const box = byId('logBox');
  box.style.display = 'block';
  const line = document.createElement('div');
  if (type) line.className = type;
  line.textContent = msg;
  box.appendChild(line);
  box.scrollTop = box.scrollHeight;
}

function getGenerationEstimate() {
  const versions = getNumberInput('versions', 2);
  const selectedSegments = segments.filter(segment => segment.selected);
  const totalChunks = selectedSegments.reduce((total, segment) => total + segment.parts.length, 0);
  const totalFiles = totalChunks * versions;
  const totalChars = selectedSegments.reduce(
    (total, segment) => total + segment.parts.reduce((partTotal, part) => partTotal + part.length, 0),
    0
  );
  return { versions, selectedSegments, totalChunks, totalFiles, totalChars, estimatedCredits: totalChars * versions };
}

function cancelGeneration() {
  fetch('/api/cancel', { method: 'POST', headers: {'Content-Type':'application/json'}, body: '{}' }).catch(() => {});
  if (generationController) generationController.abort();
  log('Cancel requested.', 'info');
}

async function startGeneration() {
  const apiKey = byId('apiKey').value.trim();
  const voiceId = byId('voiceSelect').value;
  const voiceName = byId('voiceSelect').selectedOptions[0]?.textContent || 'selected voice';
  const modelId = byId('modelSelect').value;
  const stability = getNumberInput('stability', 50) / 100;
  const similarity = getNumberInput('similarity', 75) / 100;
  const styleExag = getNumberInput('styleExag', 0) / 100;
  const speed = getNumberInput('speed', 100) / 100;
  const speakerBoost = byId('speakerBoost').checked;
  const outputFormat = byId('outputFormat').value;
  const zipFilename = byId('zipFilename').value.trim() || 'vox_batch_output';
  const filenamePattern = byId('filenamePattern').value;
  const includeManifest = byId('includeManifest').checked;
  const { versions, selectedSegments, totalFiles, estimatedCredits } = getGenerationEstimate();

  if (creditsInfo && Number.isFinite(creditsInfo.remaining) && estimatedCredits > creditsInfo.remaining) {
    const ok = confirm('Estimated credits exceed your remaining credits. Continue anyway?');
    if (!ok) return;
  }
  if (totalFiles > 50) {
    const ok = confirm('This run will generate ' + totalFiles.toLocaleString('en-US') + ' files. Continue?');
    if (!ok) return;
  }

  byId('genBtn').disabled = true;
  byId('cancelBtn').style.display = 'block';
  byId('progressBar').style.display = 'block';
  byId('logBox').innerHTML = '';
  byId('logBox').style.display = 'block';
  byId('summaryBox').style.display = 'none';

  log('Starting: ' + totalFiles + ' audio files', 'info');
  log('Voice: ' + voiceName, 'info');

  const payload = {
    api_key: apiKey, voice_id: voiceId, model_id: modelId,
    stability, similarity, style_exaggeration: styleExag,
    speed, speaker_boost: speakerBoost,
    output_format: outputFormat, versions,
    zip_filename: zipFilename,
    filename_pattern: filenamePattern,
    include_manifest: includeManifest,
    segments: selectedSegments.map(segment => ({ name: segment.name, parts: segment.parts }))
  };

  byId('progressFill').style.width = '0%';
  generationController = new AbortController();
  let successful = 0;
  let failed = 0;
  let cancelled = false;

  try {
    const res = await fetch('/api/generate', {
      method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload), signal: generationController.signal
    });
    if (!res.ok || !res.body) {
      let detail = '';
      try {
        const data = await res.json();
        detail = data.error ? ': ' + data.error : '';
      } catch(error) {}
      throw new Error('Generation request failed' + detail);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let done = 0;

    while (true) {
      const { done: streamDone, value } = await reader.read();
      if (streamDone) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.type === 'progress') {
            log((msg.ok ? '\u2713 ' : '\u2717 ') + msg.file + (msg.ok ? '' : ': ' + msg.error), msg.ok ? 'ok' : 'err');
            done++;
            if (msg.ok) successful++; else failed++;
            byId('progressFill').style.width = Math.round(done/totalFiles*100) + '%';
          } else if (msg.type === 'cancelled') {
            cancelled = true;
            log('Generation cancelled.', 'info');
          } else if (msg.type === 'done') {
            log('Done! Downloading ZIP...', 'info');
            window.location.href = '/api/download';
          } else if (msg.type === 'error') {
            log('Error: ' + msg.error, 'err');
          }
        } catch(error) {
          log('Invalid server message received.', 'err');
        }
      }
    }
  } catch(error) {
    if (error.name === 'AbortError') {
      cancelled = true;
      log('Generation cancelled.', 'info');
    } else {
      log('Error: ' + error.message, 'err');
    }
  } finally {
    const summary = byId('summaryBox');
    summary.innerHTML = '<strong>' + (cancelled ? 'Cancelled' : 'Summary') + '</strong>: ' +
      successful.toLocaleString('en-US') + ' successful, ' +
      failed.toLocaleString('en-US') + ' failed, ' +
      estimatedCredits.toLocaleString('en-US') + ' estimated credits.';
    summary.style.display = 'block';
    byId('genBtn').disabled = false;
    byId('cancelBtn').style.display = 'none';
    generationController = null;
  }
}
