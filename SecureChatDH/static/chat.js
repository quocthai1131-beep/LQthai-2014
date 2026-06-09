const socket = io();
// Tạo ngẫu nhiên một ID để phân biệt giữa các Tab trình duyệt chat với nhau
const myId = Math.random().toString(36).substring(7);

let myKeyPair = null;
let sharedSecretKey = null;

socket.on('connect', () => {
    const statusDiv = document.getElementById('status');
    if (statusDiv) {
        statusDiv.innerText = "Đã kết nối Server. Đang đợi đối phương trao đổi khóa...";
    }
});

socket.on('connect_error', (err) => {
    console.error('Lỗi kết nối Socket.IO:', err);
    const statusDiv = document.getElementById('status');
    if (statusDiv) {
        statusDiv.innerText = "Không kết nối được Server. Vui lòng kiểm tra máy chủ.";
        statusDiv.className = "status-error";
    }
});

// 1. Tự động chạy ngay khi tải trang Web
async function initSecureChat() {
    try {
        // Sinh cặp khóa Diffie-Hellman (ECDH P-256) ngay tại trình duyệt của bạn
        myKeyPair = await window.crypto.subtle.generateKey(
            { name: "ECDH", namedCurve: "P-256" }, 
            true, 
            ["deriveKey"]
        );

        // Xuất khóa công khai (Public Key) ra định dạng thô (raw)
        const exportedPubKey = await window.crypto.subtle.exportKey("raw", myKeyPair.publicKey);
        const pubKeyHex = bufToHex(exportedPubKey);
        
        // Gửi khóa công khai lên Server để chuyển tiếp tới bạn chat khác
        const statusDiv = document.getElementById('status');
        statusDiv.innerText = "Đang kết nối Server và đợi đối phương trao đổi khóa...";
        
        socket.emit('join_room', { client_id: myId, public_key: pubKeyHex });
    } catch (err) {
        console.error("Lỗi khởi tạo mật mã: ", err);
    }
}

// 2. Nhận khóa Công khai từ đối phương truyền qua Server tới
socket.on('peer_joined', async (data) => {
    if (data.client_id === myId) return;

    try {
        const peerPubKeyBuf = hexToBuf(data.public_key);
        // Nhập khóa công khai của đối phương vào bộ nhớ trình duyệt
        const peerPubKey = await window.crypto.subtle.importKey(
            "raw", 
            peerPubKeyBuf, 
            { name: "ECDH", namedCurve: "P-256" }, 
            true, 
            []
        );

        // THỰC HIỆN TOÁN HỌC DIFFIE-HELLMAN: Kết hợp khóa bí mật của mình và khóa công khai đối phương
        sharedSecretKey = await window.crypto.subtle.deriveKey(
            { name: "ECDH", public: peerPubKey },
            myKeyPair.privateKey,
            { name: "AES-GCM", length: 256 }, 
            true, 
            ["encrypt", "decrypt"]
        );

        // Cập nhật trạng thái giao diện khi trao đổi thành công
        const statusDiv = document.getElementById('status');
        statusDiv.innerText = "Đã khóa bảo mật thành công! Kênh chat đã được mã hóa bằng AES-256.";
        statusDiv.className = "status-ready";
        
        // Mở khóa các ô nhập liệu cho phép bắt đầu gõ chat
        document.getElementById('msg-input').disabled = false;
        document.getElementById('send-btn').disabled = false;
        
        // Trả lễ bằng cách tự động gửi lại Public Key của mình để máy bên kia cũng tính toán ra khóa chung
        const exportedPubKey = await window.crypto.subtle.exportKey("raw", myKeyPair.publicKey);
        socket.emit('join_room', { client_id: myId, public_key: bufToHex(exportedPubKey) });
    } catch (err) {
        console.error("Lỗi thiết lập khóa chung: ", err);
    }
});

socket.on('self_joined', async (data) => {
    if (sharedSecretKey) return;

    try {
        const selfPubKeyBuf = hexToBuf(data.public_key);
        const selfPubKey = await window.crypto.subtle.importKey(
            "raw",
            selfPubKeyBuf,
            { name: "ECDH", namedCurve: "P-256" },
            true,
            []
        );

        sharedSecretKey = await window.crypto.subtle.deriveKey(
            { name: "ECDH", public: selfPubKey },
            myKeyPair.privateKey,
            { name: "AES-GCM", length: 256 },
            true,
            ["encrypt", "decrypt"]
        );

        const statusDiv = document.getElementById('status');
        statusDiv.innerText = "Đã thiết lập kênh bảo mật nội bộ. Bạn có thể bắt đầu thử chat.";
        statusDiv.className = "status-ready";
        document.getElementById('msg-input').disabled = false;
        document.getElementById('send-btn').disabled = false;
    } catch (err) {
        console.error("Lỗi thiết lập kênh nội bộ: ", err);
    }
});

// 3. Xử lý mã hóa AES và gửi tin nhắn đi
async function sendMessage() {
    const inputElement = document.getElementById('msg-input');
    const text = inputElement.value.trim ? inputElement.value.trim() : inputElement.value;
    if (!text) return;

    inputElement.value = '';
    const encoder = new TextEncoder();
    // Tạo vector khởi tạo IV ngẫu nhiên 12 bytes chuẩn AES-GCM
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    
    // Tiến hành mã hóa AES tin nhắn dạng văn bản thành Bytes mật
    const cipherBytes = await window.crypto.subtle.encrypt(
        { name: "AES-GCM", iv: iv }, 
        sharedSecretKey, 
        encoder.encode(text)
    );

    // Phát gói tin bản mã kèm IV lên mạng Socket
    socket.emit('send_encrypted_msg', {
        iv: bufToHex(iv),
        ciphertext: bufToHex(cipherBytes),
        sender_id: myId
    });

    // Hiển thị chữ lên hộp thoại của chính mình
    const chatBox = document.getElementById('chat-box');
    chatBox.innerHTML += `<div style="margin-bottom: 8px;"><strong>Bạn:</strong> ${text}</div>`;
    chatBox.scrollTop = chatBox.scrollHeight;
}

// Lắng nghe sự kiện gõ phím Enter ở ô chat
document.getElementById('msg-input')?.addEventListener("keypress", function(event) {
    if (event.key === "Enter") {
        sendMessage();
    }
});

// 4. Nhận bản mã hóa từ mạng, tiến hành giải mã AES
socket.on('receive_encrypted_msg', async (data) => {
    if (!sharedSecretKey) return;
    try {
        const iv = hexToBuf(data.iv);
        const ciphertext = hexToBuf(data.ciphertext);
        
        // Giải mã mảng bytes bí mật bằng khóa bí mật chung đã tính từ trước
        const decryptedBuf = await window.crypto.subtle.decrypt(
            { name: "AES-GCM", iv: iv }, 
            sharedSecretKey, 
            ciphertext
        );
        
        const decoder = new TextDecoder();
        const plainText = decoder.decode(decryptedBuf);

        // Hiển thị văn bản thô đã giải mã lên màn hình
        const chatBox = document.getElementById('chat-box');
        chatBox.innerHTML += `<div style="margin-bottom: 8px; color: #2c3e50;"><strong>Đối phương:</strong> ${plainText}</div>`;
        chatBox.scrollTop = chatBox.scrollHeight;
    } catch (err) {
        console.error("Lỗi giải mã gói tin nhận được: ", err);
    }
});

// --- CÁC HÀM BỔ TRỢ CHUYỂN ĐỔI KIỂU DỮ LIỆU ---
function bufToHex(buf) {
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function hexToBuf(hex) {
    return new Uint8Array(hex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
}

// Kích hoạt hệ thống khi trang web được nạp xong
window.onload = initSecureChat;