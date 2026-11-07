# SmartMeet

**Connect. Collaborate. Communicate.**

SmartMeet is a real-time video conferencing web application designed to make online meetings seamless, interactive, and accessible. It provides essential meeting tools such as video calling, audio controls, screen sharing, and real-time chat, along with AI integration capabilities for smarter meeting experiences.

## Features

### Authentication
- User Registration and Login
- Forgot Password functionality
- Secure Password Reset through Email

### Video Conferencing
- Create and Join Meetings
- Real-time Audio and Video Communication
- Multi-participant Video Meetings
- Microphone Mute/Unmute
- Camera On/Off
- Screen Sharing

### Real-time Collaboration
- Live Meeting Chat
- Edit and Delete Messages
- Real-time Communication using Socket.IO

### AI Integration
- AI service configuration for meeting assistance
- Foundation for AI-powered transcription and meeting summaries

## Tech Stack

| Category | Technologies |
|---|---|
| Frontend | React.js, Vite, JavaScript |
| Backend | Node.js, Express.js |
| Database | MongoDB, Mongoose |
| Real-time Communication | Socket.IO, WebRTC |
| Authentication | JWT, bcrypt |
| Email Service | Brevo API |
| AI Integration | Gemini API, OpenAI API |
| Version Control | Git, GitHub |

## Project Structure

```text
SmartMeet/
│
├── client/
│   ├── public/
│   ├── src/
│   ├── .env.example
│   └── package.json
│
├── server/
│   ├── config/
│   ├── controllers/
│   ├── models/
│   ├── routes/
│   ├── .env.example
│   ├── server.js
│   └── package.json
│
├── .gitignore
└── README.md
```

## Getting Started

### Prerequisites

Install the following before running the project:

- Node.js (LTS version recommended)
- npm
- MongoDB Atlas account or local MongoDB
- Git

### 1. Clone the Repository

```bash
git clone https://github.com/shubhisaxena2205-afk/SmartMeet.git
cd SmartMeet
```

### 2. Install Backend Dependencies

```bash
cd server
npm install
```

### 3. Install Frontend Dependencies

Open a separate terminal:

```bash
cd client
npm install
```

### 4. Environment Configuration

Create a `.env` file inside both the `server` and `client` folders.

Use the following example files as templates:

- `server/.env.example`
- `client/.env.example`

Configure your own database connection, authentication secret, email service credentials, AI API keys, and WebRTC settings as required.

**Important:** Never upload actual `.env` files, API keys, database credentials, JWT secrets, or TURN credentials to GitHub.

### 5. Run the Backend

From the `server` directory:

```bash
node server.js
```

Backend default address:

```text
http://localhost:5000
```

### 6. Run the Frontend

From the `client` directory, in another terminal:

```bash
npm run dev
```

Open the local URL provided by Vite. Usually:

```text
http://localhost:5173
```

## Production Build

To build the frontend:

```bash
cd client
npm run build
```

The production build will be generated inside:

```text
client/dist
```

## Deployment

### Backend — Render

| Configuration | Value |
|---|---|
| Root Directory | `server` |
| Build Command | `npm install` |
| Start Command | `node server.js` |

Configure the required backend environment variables in Render.

### Frontend — Vercel

| Configuration | Value |
|---|---|
| Root Directory | `client` |
| Build Command | `npm run build` |
| Output Directory | `dist` |

Configure the required frontend environment variables in Vercel and point the frontend to the deployed backend URL.

## Security

- Environment variables are stored separately from source code.
- Passwords are hashed before storage.
- JWT-based authentication is used.
- Database credentials and