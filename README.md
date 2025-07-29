# TimeRecording

This is a simple SAPUI5 application for tracking time entries per project. Users can start/stop a timer or enter time manually, with optional descriptions and accounting information.

## Project Structure

```
TimeRecording/
│
├── webapp/
│   ├── controller/       # Controller files
│   ├── view/             # XML views
│   ├── fragment/         # Fragments for dialogs
│   ├── model/            # JSON data files (if used)
│   ├── Component.js      # App bootstrap
│   └── index.html        # Entry point for the app
│
├── manifest.json         # Metadata and configuration
└── README.md             # Project documentation
```

## Requirements

- Node.js
- Static file server (e.g. `serve`)
- Git

## Installation

1. Clone the repository:

```bash
git clone https://github.com/naderkharsa/TimeRecording.git
cd TimeRecording
```

2. Install a static file server (if not already installed):

```bash
npm install -g serve
```

3. Start the server:

```bash
serve ./webapp
```

4. Open the app in your browser:

```
http://localhost:3000
```

## Notes

- This project uses OpenUI5.
- All data is stored in memory only (no backend).
- To persist data, a backend integration would be needed.

## License

MIT License
