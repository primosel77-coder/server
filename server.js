const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http, { cors: { origin: "*" }, maxHttpBufferSize: 1e8 });
const path = require('path');
const fs = require('fs'); // Модуль для работы с файлами

app.use(express.static(path.join(__dirname, 'public')));

// Файлы для хранения данных
const USERS_FILE = './users.json';
const MSGS_FILE = './messages.json';

// Загружаем данные из файлов, если они есть
let usersDB = fs.existsSync(USERS_FILE) ? JSON.parse(fs.readFileSync(USERS_FILE)) : {};
let messagesHistory = fs.existsSync(MSGS_FILE) ? JSON.parse(fs.readFileSync(MSGS_FILE)) : [];
let onlineUsers = {};

// Функция сохранения базы данных
const saveData = () => {
    try {
        fs.writeFileSync(USERS_FILE, JSON.stringify(usersDB, null, 2));
        fs.writeFileSync(MSGS_FILE, JSON.stringify(messagesHistory, null, 2));
    } catch (e) { console.log("Ошибка сохранения:", e); }
};

io.on('connection', (socket) => {
    socket.on('login', (data) => {
        const user = usersDB[data.username];
        if (user && user.password === data.password) {
            onlineUsers[data.username] = socket.id;
            const myFriends = user.friends.map(fName => ({
                name: fName, online: !!onlineUsers[fName], avatar: usersDB[fName]?.avatar || '', bio: usersDB[fName]?.bio || ''
            }));
            socket.emit('login_success', { 
                username: data.username, avatar: user.avatar, bio: user.bio, friends: myFriends,
                history: messagesHistory.filter(m => m.from === data.username || m.to === data.username)
            });
            user.friends.forEach(fName => {
                if (onlineUsers[fName]) io.to(onlineUsers[fName]).emit('friend_updated', { name: data.username, online: true });
            });
        } else { socket.emit('auth_error', 'Неверный логин/пароль'); }
    });

    socket.on('register', (data) => {
        if (!data.username || data.username.trim() === "" || !data.password) return socket.emit('auth_error', 'Заполни поля!');
        if (usersDB[data.username]) return socket.emit('auth_error', 'Ник занят!');
        
        // Создаем аватарку по первой букве имени
        usersDB[data.username] = { 
            password: data.password, 
            bio: "Юзер AllWhite", 
            avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(data.username)}&background=8b0000&color=fff`,
            friends: [] 
        };
        saveData(); // Сохраняем في файл
        socket.emit('register_success');
    });

    socket.on('update_profile', (data) => {
        const me = Object.keys(onlineUsers).find(k => onlineUsers[k] === socket.id);
        if (me && usersDB[me]) {
            if (data.avatar) usersDB[me].avatar = data.avatar;
            if (data.bio) usersDB[me].bio = data.bio;
            saveData();
            socket.emit('profile_updated', { avatar: usersDB[me].avatar, bio: usersDB[me].bio });
        }
    });

    socket.on('private_message', (data) => {
        const sender = Object.keys(onlineUsers).find(k => onlineUsers[k] === socket.id);
        if (sender) {
            const msg = { 
                id: Math.random().toString(36).substr(2, 9), // Уникальный ID для удаления
                from: sender, to: data.to, text: data.text, type: data.type, fileData: data.fileData, fileName: data.fileName,
                time: new Date().toLocaleTimeString('ru-RU', {hour: '2-digit', minute:'2-digit'}) 
            };
            messagesHistory.push(msg);
            saveData(); // Сохраняем في файл
            if (onlineUsers[data.to]) io.to(onlineUsers[data.to]).emit('private_message', msg);
            socket.emit('private_message', msg);
        }
    });

    socket.on('delete_message', (data) => {
        // Удаляем сообщение из истории по ID
        messagesHistory = messagesHistory.filter(m => m.id !== data.msgId);
        saveData();
        if (onlineUsers[data.to]) io.to(onlineUsers[data.to]).emit('message_deleted', data.msgId);
        socket.emit('message_deleted', data.msgId);
    });

    socket.on('add_friend', (name) => {
        const me = Object.keys(onlineUsers).find(k => onlineUsers[k] === socket.id);
        if (me && usersDB[name] && me !== name && !usersDB[me].friends.includes(name)) {
            usersDB[me].friends.push(name);
            usersDB[name].friends.push(me);
            saveData();
            socket.emit('friend_added', { name, online: !!onlineUsers[name], avatar: usersDB[name].avatar });
        }
    });

    socket.on('disconnect', () => {
        const name = Object.keys(onlineUsers).find(k => onlineUsers[k] === socket.id);
        if (name) {
            delete onlineUsers[name];
            usersDB[name]?.friends.forEach(f => {
                if (onlineUsers[f]) io.to(onlineUsers[f]).emit('friend_updated', { name, online: false });
            });
        }
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log('AllWhite V6 persistent is running...'));
