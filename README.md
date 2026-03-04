# auto-grader-webapp

## Step 1 Initialization
1.  Clone Github repo
```
git clone https://github.com/<yourname>/auto-grader-webapp.git
cd auto-grader-webapp
```
2. Create the frontend (React + Vite)
```
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install
```
Add libraries for UI:
```
npm i react-pdf react-resizable-panels @monaco-editor/react
npm i react-router-dom react-dropzone
npm i pdfjs-dist@5.4.296
```
run
```
npm run dev
```
## Step 2 UI

Library use react-pdf to render PDF canvas
Resolve css default limit width
```
html, body, #root {
  height: 100%;
  width: 100%;
  margin: 0;
}
```
