from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from elevenlabs import ElevenLabs
from dotenv import load_dotenv
import os

load_dotenv(".env")

app = FastAPI()

# Enable CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

client = ElevenLabs(
    base_url="https://api.elevenlabs.io",
    api_key=os.getenv("ELEVEN")
)

@app.get("/")
async def root():
    return {"message": "Hello World"}

@app.get("/token")
async def getToken():
    return client.tokens.single_use.create(
        token_type="tts_websocket"
    )