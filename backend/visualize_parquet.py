import pandas as pd
import matplotlib.pyplot as plt
import matplotlib.animation as animation
import sys

def visualize(file_path):
    print(f"Veri okunuyor: {file_path}")
    try:
        df = pd.read_parquet(file_path)
    except Exception as e:
        print(f"Hata: Dosya okunamadı. ({e})")
        return

    frames = sorted(df['frame'].unique())
    print(f"Toplam frame (kare) sayısı: {len(frames)}")

    fig = plt.figure(figsize=(10, 8))
    ax = fig.add_subplot(111, projection='3d')
    
    # Şimdilik sadece vücut, sol ve sağ eli çizdirelim. (Yüz çizimi çok fazla nokta içerdiğinden yavaşlatabilir)
    types_to_plot = ['pose', 'left_hand', 'right_hand']
    colors = {'pose': 'blue', 'left_hand': 'red', 'right_hand': 'green'}

    def update(frame_idx):
        ax.clear()
        
        # Kamera (Bakış açısı) ayarları
        # MediaPipe'a göre koordinatları sınırlıyoruz
        ax.set_xlim([-1, 1])
        ax.set_ylim([-1.5, 0.5]) 
        ax.set_zlim([-1, 1])
        
        ax.set_xlabel('X')
        ax.set_ylabel('Y')
        ax.set_zlabel('Z (Derinlik)')
        ax.set_title(f"Animasyon Frame: {frame_idx}")
        
        frame_data = df[df['frame'] == frame_idx]
        
        # MediaPipe'ta Y ekseni aşağı doğru artar, bu yüzden ekranda düzgün durması için Y'yi eksi ile çarpıyoruz (-y)
        for ltype in types_to_plot:
            type_data = frame_data[frame_data['type'] == ltype]
            if len(type_data) > 0:
                ax.scatter(type_data['x'], -type_data['y'], type_data['z'], 
                           label=ltype, 
                           c=colors[ltype],
                           s=15 if ltype != 'pose' else 40)
                
        ax.legend(loc='upper right')

    print("Animasyon başlatılıyor... (Grafik penceresi açılacak)")
    # Her kare (frame) için 50ms bekle (Yaklaşık 20 FPS)
    ani = animation.FuncAnimation(fig, update, frames=frames, interval=50, repeat=True)
    plt.show()

if __name__ == "__main__":
    # İncelediğimiz klasördeki örnek parquet dosyası
    sample_file = "dataset/train/0/4.parquet"
    visualize(sample_file)
