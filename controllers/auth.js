import bcrypt from "bcrypt";
import client from '../db.js'; 
import jwt from 'jsonwebtoken';
import { randomUUID } from "crypto";
import supabase from '../supabase.js';
import admin from '../firebase_admin.js';


//sign up for the account
export const signup = async (req, res) => {
  try{
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).send({ message:"Nome e password sono richiesti."});
    
    if(username.includes(" ")) return res.status(400).json({ message: "Il nome non può avere spazi bianchi."});
    
    if(password.length <= 6) return res.status(400).json({ message: "La password deve avere minimo 7 caratteri."});

    const find = await client.query("SELECT username FROM users WHERE username=$1",[username]);
    if (find.rowCount != 0) return res.status(400).json({message:"Un utente col tuo stesso nome esiste, provane un altro."});

    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(password, salt);
    const userId  = randomUUID();
    
    const query = `INSERT INTO users (id,username, password)
      VALUES ($1, $2, $3)  RETURNING id, username`;
    await client.query(query,[userId, username,hashedPassword]); 
    const refreshToken = jwt.sign({id:userId},process.env.REFRESH_TOKEN);

    const accessToken = jwt.sign({id:userId},process.env.JWT_SECRET_KEY);;
    await client.query("INSERT INTO refresh_tokens(token) VALUES ($1)",[refreshToken]);
    return res.status(200).json({accessToken:accessToken, refreshToken:refreshToken});

  } catch(error){
    console.log(error);
    return res.status(500).json({
      message: "Database error"
    });
  }
};

export const token = async(req,res) =>{
  const refreshToken = req.body.token;
  if(refreshToken == null) return res.sendStatus(401);
  const checkToken = await client.query("SELECT token FROM refresh_tokens WHERE token = $1",[refreshToken]);
  if(checkToken.rowCount == 0) return res.status(401);
  jwt.verify(refreshToken, process.env.REFRESH_TOKEN, (err, user) =>{
    if(err) return res.sendStatus(403);
    const accessToken = generateAccessToken(user);
    return res.status(200).json({accessToken:accessToken});
  });
}


export const login = async (req,res) => {
  try{
    const {username, password} = req.body;

    const find_user = "SELECT id,username,password FROM users WHERE username=$1";
    const result = await client.query(find_user,[username]);
    if(result.rowCount == 0) return res.status(401).json({message: "Credenziali sbagliate."});

    const user = result.rows[0];
    const match = await bcrypt.compare(password,user.password);


    if(!match){
      return res.status(401).json({message: "Credenziali sbagliate."});
    }
    
    const refreshToken = jwt.sign({id:user.id},process.env.REFRESH_TOKEN);
    //username and password got accepted
    const accessToken = generateAccessToken(user);
    await client.query("INSERT INTO refresh_tokens(token) VALUES ($1)",[refreshToken]);
    return res.status(200).json({accessToken:accessToken, refreshToken:refreshToken});

  } catch(error){
    console.log(error);
    return res.status(500).json({
      message: "Database error"
    })
  }

}

function generateAccessToken(user){
  return jwt.sign({id:user.id}, process.env.JWT_SECRET_KEY, {expiresIn:'15m'});
}

export const loginJWT = (req,res) => {
  try{
    return res.status(200).json({id:req.user.id});
  }catch(error){
    console.log(error);
    return res.status(400);
  }
}


export const authenticateToken = (req,res,next) => {
  const header = req.headers['authorization'];
  const token = header && header.split(' ')[1];
  if(!token){
    return res.status(400).json({message:"Something went wrong."});
  }

  jwt.verify(token, process.env.JWT_SECRET_KEY, (err,user) =>{
    if(err) {
      return res.status(400).json({message:"Something went wrong."});
    }
    req.user = {id:user.id};
    next();
  }); 
}

export const insertFCMToken = async (req, res) => {
  try {
    const userId = req.user.id;
    const fcm_token  = req.body.fcm_token;
    if (!fcm_token) {
      return res.status(400).json({ error: "FCM token required" });
    }

    await client.query(
      `
      INSERT INTO user_tokens (user_id, fcm_token)
      VALUES ($1, $2)
      ON CONFLICT (user_id, fcm_token)
      DO NOTHING
      `,
      [userId, fcm_token]
    );

    return res.status(200).json({ message: "Token stored successfully" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to store token" });
  }
};


export const deleteFCMToken = async(req,res) => {
  try{
    const id = req.user.id;
    const result = await client.query("DELETE FROM user_tokens WHERE user_id = $1",[id]);
    return res.status(200).json({query:result.rows});
  }catch(error){
    console.log(error);
    return res.status(400);
  }
}

export const apiUsers = async (req,res) => {
  try{
    const result = await client.query("SELECT id,username FROM users");
    return res.status(200).json({query:result.rows});
  }catch(error){
    console.log(error);
    return res.status(400);
  }
}

export const makeDirectChat = async (req, res) => {
  try{
    const sender = req.user.id;
    const reciever = req.body.recieverId;
    const randomChatId = randomUUID();
    consle.log(sender, reciever, randomChatId);
    await client.query("INSERT INTO chats(id,type) VALUES($1,'DIRECT')", [randomChatId]);
    await client.query("INSERT INTO members (chat_id, user_id) VALUES ($1, $2), ($1, $3)",[randomChatId,sender,reciever]);
    return res.status(200).json({'chat_id' : randomChatId});
  }
  catch(error){
    console.log(error);
    return res.status(400);
  }
}

export const getDirectChat = async (req,res) => {
  try{
    const senderId = req.body.senderId;
    const recieverId = req.body.recieverId;
    const result = 
      await client.query("SELECT m1.chat_id FROM members m1 JOIN members m2 ON m1.chat_id = m2.chat_id JOIN chats ON chats.id = m1.chat_id WHERE type = 'DIRECT' AND  m1.user_id = $1 AND m2.user_id = $2", [senderId, recieverId]);
    if(result.rows.length == 0){
      return res.status(204).json({message:"No chat found"});
    }
    return res.status(200).json({chatId:result.rows[0].chat_id});
  }catch(error){
    console.log(error);
    return res.status(400);
  }
}

export const getMyChats = async (req, res) => {
  try {
    const user_id = req.user.id;

    const resultDIRECTS = await client.query(
      `
      SELECT
          u.username,
          u.profile_image,
          m2.user_id,
          m2.chat_id,
          lm.time,
          lm.image,
          lm.text,
          c.type
      FROM members m1
      JOIN members m2
          ON m1.chat_id = m2.chat_id
      JOIN users u
          ON u.id = m2.user_id
      JOIN chats c
          ON c.id = m2.chat_id
      LEFT JOIN LATERAL (
          SELECT time, image, text
          FROM messages
          WHERE chat_id = m2.chat_id
          ORDER BY time DESC
          LIMIT 1
      ) lm ON TRUE
      WHERE m1.user_id = $1
        AND m2.user_id != $1
        AND c.type = 'DIRECT'
      ORDER BY lm.time DESC NULLS LAST;
      `,
      [user_id]
    );

    const resultGROUPS = await client.query(
      `
      SELECT
          c.id AS chat_id,
          c.name,
          c.referencing_photo,
          m.time,
          m.text,
          m.image,
          m.type AS message_type,
          m.user_id AS sender_id
      FROM chats c
      JOIN members mem
          ON mem.chat_id = c.id
      LEFT JOIN LATERAL (
          SELECT time, text, type, user_id, image
          FROM messages
          WHERE chat_id = c.id
          ORDER BY time DESC
          LIMIT 1
      ) m ON true
      WHERE c.type = 'GROUP'
        AND mem.user_id = $1
      ORDER BY m.time DESC NULLS LAST;
      `,[user_id]
    );

    const result = [
    ...resultDIRECTS.rows,
    ...resultGROUPS.rows
    ];

    return res.status(200).json({ query: result });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to fetch chats" });
  }
};

export const getMessagesInChat = async(req,res) => {
  try{
    const chatId = req.body.chat_id;
    const result = await client.query("SELECT id,sender_id,text,time,image,sent_by_system FROM messages WHERE chat_id = $1 ORDER BY time ASC",[chatId]);
    return res.status(200).json({query:result.rows});
  }catch(error){
    console.log(error);
    return res.status(400);
  }
}


export const sendMessage = async(req,res) => {
  try{
    const user = req.user.id;
    const id = randomUUID();
    const text = req.body.text;
    const time = req.body.time;
    const chat_id = req.body.chat_id;
    const image = req.body.image || null;
    const receiverName = req.body.receiver_name;
    const groupName = req.body.groupName;
    const filePhoto = req.file|| null;
    const result = await client.query(
      "SELECT EXISTS (SELECT 1 FROM members WHERE user_id = $1 AND chat_id = $2) AS is_member",
      [user, chat_id]
    );

    if (!result.rows[0].is_member) {
      return res.sendStatus(403);
    }
    var publicUrl = '';
    if(filePhoto != null){
      const random_id_Photo= randomUUID();
      const filePath = `${chat_id}/${random_id_Photo}.png`;
      const { data, error } = await supabase.storage
        .from('photomessages')
        .upload(filePath, filePhoto.buffer, {
          contentType: filePhoto.mimetype,
          upsert: true,
      });

      if (error) throw error;
      publicUrl = `${process.env.SUPABASE_URL}/storage/v1/object/public/photomessages/${data.path}`;

      await client.query("INSERT INTO messages(id, sender_id, text, time, chat_id, image) VALUES ($1, $2, $3, $4, $5, $6)",[id,user,text,time,chat_id,publicUrl])
    }

    else{
      await client.query(
        "INSERT INTO messages(id, sender_id, text, time, chat_id) VALUES ($1, $2, $3, $4, $5)",
        [id, user, text, time, chat_id]
      );
    }


    const members = await client.query(
      "SELECT user_id FROM members WHERE chat_id = $1",
      [chat_id]
    );

    

    if (members.rows.length === 0) {
      return res.status(200).send("No members in chat");
    }

    const userIds = members.rows.map(m => m.user_id);

    const tokensResult = await client.query(
      "SELECT fcm_token FROM user_tokens WHERE user_id = ANY($1)",
      [userIds]
    );

    const fcmTokens = tokensResult.rows.map(r => r.fcm_token);

    if (fcmTokens.length === 0) {
      return res.status(200).send("No tokens found");
    }

    let title;
    if (groupName) title = groupName;
    else if (receiverName) title = receiverName;
    else title = "Nuovo messaggio!";


    const message = {
      notification: { title, body: text, image: image || undefined },
      data: {
        chat_id: chat_id.toString(),
        sender_id: user.toString(),
        text: text || "📷 Photo",
        sender_avatar: image || "",
        image:publicUrl||""
      },
      tokens: fcmTokens,
    };

    await admin.messaging().sendEachForMulticast(message);
    return res.sendStatus(200);
  }catch(error){
    console.log(error);
    return res.sendStatus(400);
  }
}

export const getImageProfile = async (req, res) => {
  try {
    const user_id = req.body.user_id;

    const result = await client.query(
      "SELECT profile_image FROM users WHERE id = $1",
      [user_id]
    );

    if (result.rows.length === 0) {
      return res.status(200).json({ profile_image: null });
    }

    return res.status(200).json({
      profile_image: result.rows[0].profile_image,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Server error" });
  }
};



export const getUsername = async(req,res) => {
  try{
    const user_id = req.user.id;
    const result = await client.query("SELECT username from users WHERE id = $1", [user_id]);
    return res.status(200).json({"username":result.rows[0].username});
  }catch(error){
    console.log(error);
    return res.status(400);
  }
}

export const getIdAndUsername = async(req,res) => {
    try{
    const user_id = req.user.id;
    const chat_id = req.body.chat_id;
    const result = await client.query(
      `
      SELECT users.id, users.username, users.profile_image
        FROM members m1 
        JOIN members m2 
        ON m1.chat_id = m2.chat_id 
        JOIN chats ON chats.id = m2.chat_id 
        JOIN users ON m2.user_id = users.id 
        WHERE m1.user_id = $1 
        AND m1.chat_id = $2 AND m2.user_id != $1 AND chats.type ='DIRECT'
      `, [user_id,chat_id]);
    
    return res.status(200).json({'id' : result.rows[0].id,"username":result.rows[0].username,'url':result.rows[0].profile_image });
  }catch(error){
    console.log(error);
    return res.status(400);
  }
}


export const changePhoto = async (req, res) => {
  try {
    const userId = req.user.id;
    const file = req.file;
    const filePath = `${userId}/profile_photo.png`;

    const { data, error } = await supabase.storage
      .from('photos')
      .upload(filePath, file.buffer, {
        contentType: file.mimetype,
        upsert: true,
    });

    if (error) throw error;
    const publicUrl = `${process.env.SUPABASE_URL}/storage/v1/object/public/photos/${data.path}`;

    await client.query(
      "UPDATE users SET profile_image = $1 WHERE id = $2",
      [publicUrl, userId]
    );

    return res.status(200).json({url:publicUrl});
  } catch (error) {
    console.log(error);
    return res.status(500).json({ error: error.message });
  }
};

export const retrieveChatId = async (req,res) => {
  try{
    const userId = req.user.id;
    const recieverId = req.body.recieverId;
    const result = await client.query("SELECT m1.chat_id FROM members m1 JOIN members m2 ON m1.chat_id = m2.chat_id AND m1.user_id = $1 AND m2.user_id = $2 JOIN chats ON chats.id = m1.chat_id AND type='DIRECT' ",[userId, recieverId]);
    if(result.rows.length == 0){
      return res.status(200).json({'chat_id':''})
    }
    return res.status(200).json({'chat_id':result.rows[0].chat_id});
  }catch(e){
    console.log(e);
    return res.status(500).json({'message':'Errore'});
  }
}


export const createGroup = async(req,res) => {
  try{
    const chatId = randomUUID();
    const name = req.body.name;
    const members = JSON.parse(req.body.members);
    const time = req.body.time;
    if(req.file != null){
      const file = req.file;
      const filePath = `${chatId}/profile_photo.png`;
      const { data, error } = await supabase.storage
        .from('photos')
        .upload(filePath, file.buffer, {
          contentType: file.mimetype,
          upsert: true,
      });
      const publicUrl = `${process.env.SUPABASE_URL}/storage/v1/object/public/photos/${data.path}`;
      await client.query('INSERT INTO chats (id,type,name, referencing_photo) VALUES($1,$2,$3,$4)',[chatId,'GROUP',name, publicUrl]);
    }
    else{
      await client.query('INSERT INTO chats (id,type,name) VALUES($1,$2,$3)',[chatId,'GROUP',name]);
    }
    const placeholders = members.map((_, i) => `($${i*2+1}, $${i*2+2})`).join(', ');
    const valuesArray = members.flatMap(user => [user, chatId]);
    await client.query(`
      INSERT INTO members (user_id, chat_id )
      VALUES ${placeholders}
    `,valuesArray);
    
    const mesId = randomUUID();
    await client.query('INSERT INTO messages (id,text,time,chat_id,sent_by_system) VALUES($1,$2,$3,$4,$5)',[mesId,"Nuovo Gruppo Creato!",time,chatId,'TRUE'])
    return res.status(200).json();
  }catch(e){
    console.log(e);
    return res.status(500).json({'message':'Errore'});
  }

}
