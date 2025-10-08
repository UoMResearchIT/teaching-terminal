// --- Monaco Editor Setup ---
require.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.43.0/min/vs' }});
require(['vs/editor/editor.main'], function() {
  window.editor = monaco.editor.create(document.getElementById('monaco-editor'), {
    value: '# Start editing your Dockerfile or YAML\n',
    language: 'dockerfile',  // change to 'yaml' for YAML files
    theme: 'vs-dark',
    automaticLayout: true,
  });
});

document.getElementById('saveBtn').addEventListener('click', () => {
  fetch('/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: window.editor.getValue() })
  }).then(() => alert('Saved!'));
});

// --- xterm.js terminal ---
const term = new Terminal({ theme: { background: '#1e1e1e' }, cursorBlink: true });
term.open(document.getElementById('terminal'));

const socket = io('/terminal');
socket.on('connect', () => term.writeln('Connected to Flask terminal\r\n'));
socket.on('disconnect', () => term.writeln('\r\n[disconnected]'));
socket.on('output', data => term.write(data));

term.onData(data => {
  socket.emit('input', data);
  if (data === '\r') appendHistory(currentLine());
});

// --- rolling command log ---
const hist = document.getElementById('history');
function appendHistory(cmd) {
  if (!cmd.trim()) return;
  const el = document.createElement('div');
  el.className = 'cmd';
  el.textContent = cmd;
  hist.appendChild(el);
  hist.scrollTop = hist.scrollHeight;
}

let buffer = '';
function currentLine() { const line = buffer; buffer=''; return line; }
term.onKey(e => {
  const { key, domEvent } = e;
  if (domEvent.key === 'Enter') return;
  if (domEvent.key === 'Backspace') buffer = buffer.slice(0,-1);
  else if (domEvent.key.length===1) buffer += domEvent.key;
});

fetch('/history')
  .then(r => r.json())
  .then(data => data.forEach(c => appendHistory(c)));
