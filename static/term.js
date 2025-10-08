window.addEventListener('DOMContentLoaded', () => {

  // ---------------------------------------------------------------------------
  // Create editor

  const editorContainer = document.getElementById('monaco-editor');

  require.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.43.0/min/vs' }});
  require(['vs/editor/editor.main'], function () {
    window.editor = monaco.editor.create(editorContainer, {
      language: 'dockerfile',
      theme: 'vs-dark',
      automaticLayout: false, // we'll handle resizing ourselves
      fontSize: 18      
    });

    let saveTimer = null;
    window.editor.onDidChangeModelContent(() => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        const path = document.getElementById('filename').value.trim() || 'untitled';
        const content = window.editor.getValue();
        
        fetch('/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path, content })
        });
      }, 500); // save 0.5s after typing stops
    });
  });

  // ---------------------------------------------------------------------------
  // Create terminal object
  
  const terminalContainer = document.getElementById('terminal');

  const term = new Terminal({ theme: { background: '#1e1e1e' },
                              cursorBlink: true,
                              fontSize: 16
                            });
  term.open(terminalContainer);

  const fitAddon = new FitAddon.FitAddon();
  term.loadAddon(fitAddon);
  fitAddon.fit();

  window.term = term;
  window.fitAddon = fitAddon;

  // ---------------------------------------------------------------------------
  // Connect terminal to backend

  const socket = io('/terminal');

  socket.on('connect', () => term.writeln('[Connected]\r\n'));
  socket.on('disconnect', () => term.writeln('\r\n[disconnected]'));
  socket.on('output', data => term.write(data));

  // Send keystrokes to backend
  term.onData(data => {
    socket.emit('input', data);
    if (data === '\r') appendHistory(currentLine());
  });

  // ------------------------------------------------------------------------------
  // Populate history element

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
    if (domEvent.key === 'Backspace') buffer = buffer.slice(0,1);
    else if (domEvent.key.length===1) buffer += domEvent.key;
  });

  // ---------------------------------------------------------------------------
  // Allow resizing
  const resizeObserver = new ResizeObserver(() => {
    if (window.editor) window.editor.layout();
    if (window.fitAddon) window.fitAddon.fit();
  });

  resizeObserver.observe(editorContainer);
  resizeObserver.observe(terminalContainer);
});
