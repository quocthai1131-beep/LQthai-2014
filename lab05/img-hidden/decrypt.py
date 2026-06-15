import sys
from PIL import Image

def decode_image(encoded_image_path):
    img = Image.open(encoded_image_path)
    width, height = img.size
    binary_message = ""
    
    for row in range(height):
        for col in range(width):
            pixel = img.getpixel((col, row))
            
            for color_channel in range(3):
                binary_message += format(pixel[color_channel], '08b')[-1]
                
    message = ""
    for i in range(0, len(binary_message), 8):
        char_binary = binary_message[i:i+8]
        
        # Kiểm tra nếu chuỗi bit đánh dấu kết thúc thông điệp (11111111 từ ký tự kết thúc)
        # Hoặc kiểm tra điều kiện gốc trong tài liệu bằng ký tự đặc biệt
        char = chr(int(char_binary, 2))
        
        # Trong file mã hóa (encrypt) dùng '1111111111111110' làm điểm dừng, 
        # Đoạn code mẫu kiểm tra ký tự điều khiển hoặc kết thúc chuỗi bit:
        if char == '\0' : 
            break
        message += char
        
    return message

def main():
    if len(sys.argv) != 2:
        print("Usage: python decrypt.py <encoded_image_path>")
        return
        
    encoded_image_path = sys.argv[1]
    decoded_message = decode_image(encoded_image_path)
    print("Decoded message:", decoded_message)

if __name__ == "__main__":
    main()