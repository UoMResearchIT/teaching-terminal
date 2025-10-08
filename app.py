from flask import Flask, send_from_directory, request, jsonify
from flask_socketio import SocketIO, emit
import subprocess, os, pty, select, json

app = Flask(__name__, static_folder="static")
socketio = SocketIO(app, cors_allowed_origins="*")

HISTORY_FILE = "bash_history.json"

# --- util: append command to history as soon as entered ---
def log_command(cmd):
    history = []
    if os.path.exists(HISTORY_FILE):
        with open(HISTORY_FILE) as f:
            history = json.load(f)
    history.append(cmd)
    with open(HISTORY_FILE, "w") as f:
        json.dump(history[-200:], f, indent=2)  # keep last 200 cmds

# --- serve frontend ---
@app.route("/")
def index():
    return send_from_directory(app.static_folder, "index.html")

# --- endpoint to read saved history (for the log panel) ---
@app.route("/history")
def history():
    if not os.path.exists(HISTORY_FILE):
        return jsonify([])
    with open(HISTORY_FILE) as f:
        return jsonify(json.load(f))

# --- WebSocket terminal handler ---
@socketio.on("connect", namespace="/terminal")
def connect_terminal():
    # Spawn a bash pseudo-tty
    pid, fd = pty.fork()
    if pid == 0:
        os.execvp("bash", ["bash"])
    else:
        app.logger.info("Spawned bash with pid %s", pid)
        socketio.start_background_task(target=read_output, fd=fd)

        @socketio.on("input", namespace="/terminal")
        def _receive(data):
            os.write(fd, data.encode())
            if data.endswith("\r"):  # Enter pressed
                # Roughly extract last command from buffer
                line = data.strip()
                if line:
                    log_command(line)

        @socketio.on("disconnect", namespace="/terminal")
        def _disconnect():
            try:
                os.close(fd)
            except OSError:
                pass

def read_output(fd):
    """Continuously read pty and emit to client"""
    while True:
        socketio.sleep(0.01)
        if select.select([fd], [], [], 0)[0]:
            try:
                data = os.read(fd, 1024).decode(errors="ignore")
                socketio.emit("output", data, namespace="/terminal")
            except OSError:
                break

SAVE_FILE = "Dockerfile"
@app.route("/save", methods=["POST"])
def save_file():
    content = request.json.get("content", "")
    with open(SAVE_FILE, "w") as f:
        f.write(content)
    return jsonify({"status":"ok"})

if __name__ == "__main__":
    socketio.run(app, host="0.0.0.0", port=5000)
