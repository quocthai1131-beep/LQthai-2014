from flask import Flask, render_template, request
from flask_socketio import SocketIO, emit

app = Flask(__name__)
# Khởi tạo SocketIO hỗ trợ giao tiếp thời gian thực, cho phép kết nối chéo CORS
# Sử dụng async_mode rõ ràng để chạy được cả khi không có eventlet/gevent
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="threading")

@app.route('/')
def index():
    # Trả về giao diện trang chat chính
    return render_template('chat.html')

@socketio.on('join_room')
def handle_join(data):
    """Xử lý khi một client truy cập web và gửi Khóa công khai (Public Key) lên"""
    client_id = data.get('client_id')
    public_key_hex = data.get('public_key')
    print(f"[*] Client {client_id} đã tham gia phòng chat.")
    
    # Phát quảng bá (broadcast) khóa công khai này cho các client khác trong hệ thống
    emit('peer_joined', {
        'client_id': client_id, 
        'public_key': public_key_hex
    }, broadcast=True, include_self=False)

    # Gửi lại public key cho chính client vừa đăng ký để demo có thể chạy ngay cả khi chỉ có một tab
    emit('self_joined', {
        'client_id': client_id,
        'public_key': public_key_hex
    }, room=request.sid)

@socketio.on('send_encrypted_msg')
def handle_message(data):
    """Nhận tin nhắn đã mã hóa AES từ một client và chuyển tiếp nguyên văn sang client kia"""
    emit('receive_encrypted_msg', {
        'iv': data.get('iv'),
        'ciphertext': data.get('ciphertext'),
        'sender_id': data.get('sender_id')
    }, broadcast=True, include_self=False)

if __name__ == '__main__':
    # Chạy ứng dụng Web ở cổng 5000 cục bộ
    socketio.run(app, host='127.0.0.1', port=5000, debug=True)