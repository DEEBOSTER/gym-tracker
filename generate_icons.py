import zlib
import struct
import os

def create_png(width, height, filename):
    # Generates a solid dark gym-themed icon with accent center in PNG format
    raw_data = bytearray()
    for y in range(height):
        raw_data.append(0)  # Filter type 0 (None)
        for x in range(width):
            # Distance from center
            dx = (x - width / 2) / (width / 2)
            dy = (y - height / 2) / (height / 2)
            dist_sq = dx*dx + dy*dy
            
            # Rounded rect border
            if abs(dx) > 0.85 or abs(dy) > 0.85:
                # Dark outer border
                r, g, b = 15, 23, 42
            elif dist_sq < 0.35:
                # Cyan/Emerald accent in center (dumbbell motif)
                r, g, b = 16, 185, 129
            elif dist_sq < 0.45:
                # Accent ring
                r, g, b = 59, 130, 246
            else:
                # Background slate-900
                r, g, b = 2, 6, 23
            
            raw_data.extend((r, g, b, 255))
            
    def chunk(tag, data):
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)

    ihdr = struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)
    idat = zlib.compress(bytes(raw_data), 9)
    
    png_data = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr) + chunk(b'IDAT', idat) + chunk(b'IEND', b'')
    
    with open(filename, 'wb') as f:
        f.write(png_data)
    print(f"Created {filename}")

if __name__ == "__main__":
    static_dir = os.path.join(os.path.dirname(__file__), "static")
    os.makedirs(static_dir, exist_ok=True)
    create_png(192, 192, os.path.join(static_dir, "icon-192.png"))
    create_png(512, 512, os.path.join(static_dir, "icon-512.png"))
