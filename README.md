# Express Login App

A simple Node.js Express application with user authentication using sessions and EJS templating.

## Features

- Login page with password authentication
- Protected dashboard page
- Session management
- Environment variable configuration

## Setup

1. Install dependencies:
   ```
   npm install
   ```

2. Configure environment variables in `.env`:
   - `PASSWORD`: Set your desired password
   - `PORT`: Server port (default 3000)

3. Start the server:
   ```
   npm start
   ```

4. Open your browser and navigate to `http://localhost:3000`

## Usage

- Visit the root URL to access the dashboard (redirects to login if not authenticated)
- Login with any username and the password from `.env`
- Access the dashboard after successful login
- Logout to end the session