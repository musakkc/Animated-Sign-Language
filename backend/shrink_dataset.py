import pandas as pd
import os
import shutil

def shrink_dataset(source_dir, dest_dir):
    train_csv_path = os.path.join(source_dir, 'train.csv')
    if not os.path.exists(train_csv_path):
        print(f"HATA: {train_csv_path} bulunamadı!")
        print("Lütfen içinde 'train.csv' olan ana klasörün yolunu verdiğinizden emin olun.")
        return
        
    print("train.csv okunuyor...")
    df = pd.read_csv(train_csv_path)
    
    # 'sign' sütunu baz alınarak her kelime için sadece 1 (ilk) video dosyası seçilir.
    if 'sign' not in df.columns:
        print("HATA: train.csv içinde 'sign' sütunu bulunamadı. Veri seti yapısı farklı olabilir.")
        return
        
    df_optimized = df.drop_duplicates(subset=['sign'], keep='first').copy()
    
    print("-" * 40)
    print(f"Toplam eşsiz kelime sayısı: {len(df['sign'].unique())}")
    print(f"Kopyalanacak dosya sayısı: {len(df_optimized)}")
    print(f"Gereksiz (kopyalanmayacak) dosya sayısı: {len(df) - len(df_optimized)}")
    print("-" * 40)
    
    os.makedirs(dest_dir, exist_ok=True)
    
    print("Dosyalar kopyalanıyor, bu işlem birkaç dakika sürebilir...")
    
    new_rows = []
    
    for index, row in df_optimized.iterrows():
        old_rel_path = row['path']
        old_abs_path = os.path.join(source_dir, old_rel_path)
        
        # Yeni dosya yolunu daha temiz yapıyoruz: parquet_files/{sign_id}.parquet
        new_rel_path = f"parquet_files/{row['sign']}.parquet"
        new_abs_path = os.path.join(dest_dir, new_rel_path)
        
        os.makedirs(os.path.dirname(new_abs_path), exist_ok=True)
        
        if os.path.exists(old_abs_path):
            shutil.copy2(old_abs_path, new_abs_path)
            
            # Yeni satırı kaydet (path güncellenmiş haliyle)
            new_row = row.copy()
            new_row['path'] = new_rel_path
            new_rows.append(new_row)
        else:
            print(f"Uyarı: {old_abs_path} bulunamadı, bu kelime atlanıyor.")
            
    # Sadece 226 (veya 250) satırlık temizlenmiş yeni train.csv'yi projemize kaydedelim
    df_new_train = pd.DataFrame(new_rows)
    df_new_train.to_csv(os.path.join(dest_dir, 'train.csv'), index=False)
    
    print("\nİşlem Başarıyla Tamamlandı! 🎉")
    print(f"Kompakt veri seti şu klasöre oluşturuldu: {dest_dir}")
    print("Artık 35 GB'lık orijinal klasörü bilgisayarınızdan silebilirsiniz!")

if __name__ == "__main__":
    print("\n=== Veri Seti Küçültme ve Süzme Aracı ===")
    print("Bu araç, 35 GB'lık veri setinden sadece ihtiyacımız olan dosyaları çeker.")
    source = input("\nLütfen 35 GB'lık indirdiğiniz ana klasörün TAM YOLUNU yazın:\n(Örnek: C:\\Users\\musak\\Downloads\\asl-signs )\n> ")
    
    # Hedef klasör: backend/dataset
    dest = os.path.join(os.path.dirname(os.path.abspath(__file__)), "dataset")
    
    # Tırnak işaretlerini temizleyelim (klasör yolunu kopyalarken gelebilir)
    clean_source = source.strip('"').strip("'")
    
    shrink_dataset(clean_source, dest)
