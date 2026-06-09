from flask import Flask, render_template, request
from flask_socketio import SocketIO, emit, join_room, leave_room

app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="threading")

# Keep track of peers' public keys per room so new joiners can receive existing peers' public keys
rooms_public = {}


@app.route('/')
def index():
    return render_template('chat_form.html')


@socketio.on('join')
def handle_join(data):
    room = data.get('room', 'main')
    nickname = data.get('nickname', 'Anon')
    public_key = data.get('public_key')
    sid = request.sid
    join_room(room)
    # store public key for this sid in the room map
    rooms_public.setdefault(room, {})
    rooms_public[room][sid] = {'public_key': public_key, 'nickname': nickname}

    # Notify existing clients in the room about the new peer and share their public key
    emit('user_joined', {'client_id': sid, 'nickname': nickname, 'public_key': public_key}, room=room, include_self=False)

    # Send existing peers' public keys to the joining client so it can derive shared secrets
    existing = []
    for peer_sid, info in rooms_public[room].items():
        if peer_sid == sid:
            continue
        existing.append({'client_id': peer_sid, 'nickname': info.get('nickname'), 'public_key': info.get('public_key')})

    emit('existing_peers', {'peers': existing}, room=sid)

    # Send an acknowledgement back to the joining client
    emit('joined_ack', {'client_id': sid, 'room': room}, room=sid)


@socketio.on('send_encrypted_msg')
def handle_encrypted(data):
    room = data.get('room', 'main')
    # Relay the encrypted message to other users in the same room
    emit('receive_encrypted_msg', {
        'iv': data.get('iv'),
        'ciphertext': data.get('ciphertext'),
        'sender_id': data.get('sender_id'),
        'nickname': data.get('nickname')
    }, room=room, include_self=False)


@socketio.on('leave')
def handle_leave(data):
    room = data.get('room', 'main')
    leave_room(room)
    # remove from map
    if room in rooms_public and request.sid in rooms_public[room]:
        del rooms_public[room][request.sid]
    emit('user_left', {'client_id': request.sid}, room=room)


if __name__ == '__main__':
    socketio.run(app, host='127.0.0.1', port=5001, debug=True)
