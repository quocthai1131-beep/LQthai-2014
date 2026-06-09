const socket = io();
let myId = Math.random().toString(36).substring(7);
let myKeyPair = null;
let sharedSecretKey = null;
let currentRoom = null;
let nickname = null;

async function connect(){
  nickname = document.getElementById('nickname').value || ('Anon'+myId);
  currentRoom = document.getElementById('room').value || 'main';
  const status = document.getElementById('status');
  status.innerText = 'Generating ECDH keys...';

  myKeyPair = await window.crypto.subtle.generateKey({name:'ECDH', namedCurve:'P-256'}, true, ['deriveKey']);
  const exported = await window.crypto.subtle.exportKey('raw', myKeyPair.publicKey);
  const pubHex = bufToHex(exported);

  socket.emit('join', {room: currentRoom, nickname: nickname, public_key: pubHex});

  status.innerText = `Connecting to room ${currentRoom}...`;
}

socket.on('joined_ack', (data)=>{
  document.getElementById('status').innerText = `Joined ${data.room} as ${nickname}`;
  document.getElementById('setup').style.display = 'none';
  document.getElementById('chat').style.display = 'block';
});

socket.on('user_joined', async (data)=>{
  // import peer public key and derive shared key
  try{
    const peerBuf = hexToBuf(data.public_key);
    const peerKey = await window.crypto.subtle.importKey('raw', peerBuf, {name:'ECDH', namedCurve:'P-256'}, true, []);
    sharedSecretKey = await window.crypto.subtle.deriveKey({name:'ECDH', public: peerKey}, myKeyPair.privateKey, {name:'AES-GCM', length:256}, true, ['encrypt','decrypt']);
    document.getElementById('status').innerText = `Secure channel ready with ${data.nickname}`;
  }catch(e){console.error(e)}
});

// When a client joins and there are existing peers, server will send an array of peers
socket.on('existing_peers', async (data) => {
  try {
    const peers = data.peers || [];
    for (let p of peers) {
      try {
        const peerBuf = hexToBuf(p.public_key);
        const peerKey = await window.crypto.subtle.importKey('raw', peerBuf, {name:'ECDH', namedCurve:'P-256'}, true, []);
        // derive and set sharedSecretKey (for simplicity take the first available)
        sharedSecretKey = await window.crypto.subtle.deriveKey({name:'ECDH', public: peerKey}, myKeyPair.privateKey, {name:'AES-GCM', length:256}, true, ['encrypt','decrypt']);
        document.getElementById('status').innerText = `Secure channel ready with ${p.nickname}`;
        break;
      } catch(e) { console.error('peer derive failed', e); }
    }
  } catch(e) { console.error(e); }
});

socket.on('receive_encrypted_msg', async (data)=>{
  if(!sharedSecretKey) return;
  try{
    const iv = hexToBuf(data.iv);
    const ct = hexToBuf(data.ciphertext);
    const dec = await window.crypto.subtle.decrypt({name:'AES-GCM', iv:iv}, sharedSecretKey, ct);
    const msg = new TextDecoder().decode(dec);
    const box = document.getElementById('chat-box');
    box.innerHTML += `<div><strong>${data.nickname || 'Peer'}:</strong> ${msg}</div>`;
    box.scrollTop = box.scrollHeight;
  }catch(e){console.error('decrypt fail', e)}
});

async function sendMessage(){
  if(!sharedSecretKey){ alert('Secure channel not ready'); return; }
  const input = document.getElementById('msg-input');
  const text = input.value.trim(); if(!text) return;
  input.value = '';
  const encoder = new TextEncoder();
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const cipher = await window.crypto.subtle.encrypt({name:'AES-GCM', iv:iv}, sharedSecretKey, encoder.encode(text));
  socket.emit('send_encrypted_msg', {room: currentRoom, iv: bufToHex(iv), ciphertext: bufToHex(cipher), sender_id: myId, nickname: nickname});
  const box = document.getElementById('chat-box');
  box.innerHTML += `<div style="color:#2c3e50;"><strong>You:</strong> ${text}</div>`;
  box.scrollTop = box.scrollHeight;
}

function bufToHex(buf){ return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join(''); }
function hexToBuf(hex){ return new Uint8Array(hex.match(/.{1,2}/g).map(b=>parseInt(b,16))); }

window.addEventListener('keydown', (e)=>{ if(e.key==='Enter' && document.getElementById('chat').style.display==='block'){ sendMessage(); } });
