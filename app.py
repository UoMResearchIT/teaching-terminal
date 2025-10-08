from flask import Flask, send_from_directory, request, jsonify
from flask_socketio import SocketIO, emit
import subprocess, os, pty, select, json

app = Flask(__name__, static_folder="static")
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="threading")

SAVE_FILE = "Dockerfile"

# --- serve frontend ---
@app.route("/")
def index():
    return send_from_directory(app.static_folder, "index.html")

# --- WebSocket terminal handler ---
@socketio.on("connect", namespace="/terminal")
def connect_terminal():
    # Spawn a bash pseudo-tty
    pid, fd = pty.fork()
    if pid == 0:
        os.execvp("bash", ["bash"])
    else:
        socketio.start_background_task(target=read_output, fd=fd)

        @socketio.on("input", namespace="/terminal")
        def _receive(data):
            os.write(fd, data.encode())

        @socketio.on("disconnect", namespace="/terminal")
        def _disconnect():
            try:
                os.close(fd)
            except OSError:
                pass

def read_output(fd):
    while True:
        socketio.sleep(0.01)
        try:
            # Check file descriptor
            if select.select([fd], [], [], 0)[0]:
                # Get data
                data = os.read(fd, 1024).decode(errors="ignore")

                # Emit
                socketio.emit("output", data, namespace="/terminal")
        except (OSError, ValueError):
            break

@app.route("/save", methods=["POST"])
def save_file():
    content = request.json.get("content", "")
    with open(SAVE_FILE, "w") as f:
        f.write(content)
    return jsonify({"status":"ok"})

if __name__ == "__main__":
    socketio.run(app, host="0.0.0.0", port=5000)
