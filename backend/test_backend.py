import requests
import base64

def test_transcribe():
    url = "http://127.0.0.1:8000/transcribe-base64"
    # Create a dummy small wav/m4a file content (just some bytes)
    # Actually, base64 decoding a non-audio file might cause Whisper to fail
    # Let's see if we can find an audio file in the repo
    
    payload = {
        "audio_base64": "UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=", # Dummy WAV header
        "previous_text": ""
    }
    try:
        response = requests.post(url, json=payload)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.text}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_transcribe()
