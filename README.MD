/*************  ✨ Windsurf Command ⭐  *************/
# DeepSeek Server

This is a Node.js server that uses the DeepSeek AI to generate responses to user input. It also uses the Volcengine TTS API to generate audio files of the responses.

## Installation

1. Clone the repository
2. Install dependencies with `npm install`
3. Set up environment variables `DEEPSEEK_API_KEY`, `VOLC_APPID`, and `VOLC_TOKEN` in a `.env` file
4. Start the server with:
```JS
npm start
ngrok http 3001
```

## Endpoints

### GET /chat

* `ngrok`: generate a public url that is accessible to all
* `message`: The user's input message
* `voice`: The voice type to use for the response audio file (default is `zh_female_linjianvhai_moon_bigtts`)
* `sessionId`: The session ID to use for the response (default is `default_session`)

Returns a JSON object with the following properties:

* `reply`: The AI's response to the user's input
* `audioUrl`: The URL of the audio file of the response
* `sessionId`: The session ID used for the response

## Environment Variables

* `DEEPSEEK_API_KEY`: The DeepSeek API key
* `VOLC_APPID`: The Volcengine TTS API app ID
* `VOLC_TOKEN`: The Volcengine TTS API token
/*******  9d8e4c14-96a7-4442-b7e9-a9ffcbaf6a67  *******/