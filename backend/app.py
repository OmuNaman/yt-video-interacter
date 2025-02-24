import os
from flask import Flask, request, jsonify
from flask_cors import CORS
from youtube_transcript_api import YouTubeTranscriptApi
import re
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
CORS(app)

# Gemini Configuration (Safe Retrieval)
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    print("GEMINI_API_KEY not found. Chat functionality will be disabled.")
    genai_model = None
else:
    try:
        genai.configure(api_key=GEMINI_API_KEY)
        genai_model = genai.GenerativeModel(
            model_name="gemini-1.5-pro-latest",  # Or your preferred model
            system_instruction="You are a helpful learning assistant. You are assisting the user understand content from a YouTube video. Be concise and to the point and maintain a professional yet friendly tone.",
        )
        print("Gemini model loaded successfully.")
    except Exception as e:
        print(f"Failed to load Gemini model: {e}. Chat disabled.")
        genai_model = None


# In-Memory Chat History (Not for production - use a database!)
chat_history = {}  # {video_url: [(user_message, ai_response), ...]}

# Helper Functions (moved to helper functions for better organization)
def extract_video_id(url):
    patterns = [
        r'(?:v=|\/)([0-9A-Za-z_-]{11}).*',
        r'youtu.be\/([0-9A-Za-z_-]{11})',
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    return None

def format_transcript_with_timestamps(transcript):
    formatted_text = ""
    for segment in transcript:
        start_time = round(segment['start'], 2)
        duration = round(segment['duration'], 2)
        end_time = round(start_time + duration, 2)
        text = segment['text']
        formatted_text += f"[{start_time} - {end_time}] {text}\n"
    return formatted_text

def get_all_subtitles_with_timestamps(video_url):
    try:
        video_id = extract_video_id(video_url)
        if not video_id:
            return {"error": "Invalid YouTube URL"}

        transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)
        all_subtitles = {}
        auto_generated_found = False
        other_subtitles_count = 0

        for transcript in transcript_list:
            try:
                if transcript.is_generated and not auto_generated_found:
                    language_code = transcript.language_code
                    language = transcript.language
                    subtitles = transcript.fetch()
                    formatted_subs = format_transcript_with_timestamps(subtitles)
                    key_name = f"{language} ({language_code}) - Auto-generated"
                    all_subtitles[key_name] = formatted_subs
                    auto_generated_found = True
            except Exception as e:
                print(f"Error processing auto-generated transcript for {transcript.language_code}: {e}")

        for transcript in transcript_list:
            try:
                if not transcript.is_generated and other_subtitles_count < 2:
                    language_code = transcript.language_code
                    language = transcript.language
                    subtitles = transcript.fetch()
                    formatted_subs = format_transcript_with_timestamps(subtitles)
                    key_name = f"{language} ({language_code}) - Manual"
                    all_subtitles[key_name] = formatted_subs
                    other_subtitles_count += 1
            except Exception as e:
                print(f"Error processing manual transcript for {transcript.language_code}: {e}")

        if not all_subtitles:
            return {"error": "No subtitles available for this video."}

        return all_subtitles

    except Exception as e:
        return {"error": str(e)}

# API Endpoints

@app.route('/transcript', methods=['POST'])
def get_transcript():
    data = request.get_json()
    video_url = data.get('videoUrl')

    if not video_url:
        return jsonify({"error": "videoUrl is required"}), 400

    try:
        subtitles = get_all_subtitles_with_timestamps(video_url)
        return jsonify(subtitles)
    except Exception as e:
        print(f"Transcript API Error: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/chat', methods=['POST'])
def chat_with_gemini():
    if genai_model is None:
        return jsonify({"error": "Gemini model not configured"}), 500

    data = request.get_json()
    video_url = data.get('videoUrl') # Get video_url from the request
    user_message = data.get('message')

    if not video_url:
        return jsonify({"error": "videoUrl is required"}), 400
    if not user_message:
        return jsonify({"error": "Message is required"}), 400

    try:
        # 1. Get the transcript (if you haven't already, or if it's a new video)
        if video_url not in chat_history:
            subtitles = get_all_subtitles_with_timestamps(video_url)
            if "error" in subtitles:
                return jsonify({"error": subtitles["error"]}), 400

            # Combine transcript into a single string (if needed)
            transcript = ""
            for key in subtitles:
                if key != "error": # if error don't proceed
                     transcript += subtitles[key] + "\n"

            chat_history[video_url] = [] #Initialise the url

        # 2. Construct the prompt, including conversation history (VERY IMPORTANT)
        context = "\n".join([f"User: {u}\nAI: {a}" for u, a in chat_history[video_url]])
        prompt = f"You are a helpful learning assistant.  Answer questions based on the following YouTube video transcript. You will also be provided with a history of previous conversation between the user and you:\n\nTranscript:\n{transcript}\n\nConversation History:\n{context}\n\nUser Question: {user_message}"

        # 3. Get the AI's response
        response = genai_model.generate_content(prompt)
        ai_response = response.text

        # 4. Update the chat history
        chat_history[video_url].append((user_message, ai_response))  # Add to history

        return jsonify({"response": ai_response})

    except Exception as e:
        print(f"Chat API Error: {e}")
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True) # Remove debug=True for production