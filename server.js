const client = require('./db');
const { signup, login, authenticateToken, loginJWT, token, apiUsers, getMyChats, insertFCMToken, makeDirectChat, getDirectChat, getUsername, getMessagesInChat, sendMessage, getImageProfile, getIdAndUsername, changePhoto, getFile } = require('./controllers/auth');
const express = require("express");
const cors = require("cors");
const app = express();
const server = require('http').createServer(app);
const multer = require('multer');

app.use(cors());
app.use(express.json());
const upload = multer({ storage: multer.memoryStorage() });


client.connect();

app.post('/signup', signup);

app.post('/login', login);

app.post('/token', token);

app.post('/loginJWT', authenticateToken, loginJWT);

app.get('/api/users', apiUsers);

app.post('/api/insertFCMToken',authenticateToken,insertFCMToken);

app.post('/api/getUsername', authenticateToken, getUsername);

app.post('/api/makeDirectChat',makeDirectChat);

app.post('/api/getDirectChat', getDirectChat);

app.post('/api/getMychats', getMyChats);

app.post('/api/getMessagesInChat', authenticateToken, getMessagesInChat);

app.post('/api/sendMessage',authenticateToken,upload.single('photo'),sendMessage);


app.post('/api/getImageProfile', getImageProfile);

app.post(
  '/api/changePhoto',
  authenticateToken,
  upload.single('photo'),
  changePhoto
);

app.post('/api/getIdAndUsername', authenticateToken,getIdAndUsername);


server.listen(process.env.PORT, () => {
  console.log('Server running on port 3000');
});

