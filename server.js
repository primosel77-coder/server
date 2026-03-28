const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http, { cors: { origin: "*" }, maxHttpBufferSize: 1e8 });
const path = require('path');
const fs = require('fs');

app.use(express.static(path.join(__dirname, 'public')));

const USERS_FILE = './users.json';
const MSGS_FILE  = './messages.json';

let usersDB       = fs.existsSync(USERS_FILE) ? JSON.parse(fs.readFileSync(USERS_FILE)) : {};
let messagesHistory = fs.existsSync(MSGS_FILE)  ? JSON.parse(fs.readFileSync(MSGS_FILE))  : [];
let onlineUsers   = {};   // username -> socket.id

const saveData = () => {
    fs.writeFileSync(USERS_FILE, JSON.stringify(usersDB, null, 2));
    fs.writeFileSync(MSGS_FILE,  JSON.stringify(messagesHistory, null, 2));
};

/* ── helpers ──────────────────────── */
function whoIs(socketId) {
    return Object.keys(onlineUsers).find(k => onlineUsers[k] === socketId);
}

/* ── socket events ────────────────── */
io.on('connection', (socket) => {

    /* LOGIN */
    socket.on('login', (data) => {
        const user = usersDB[data.username];
        if (user && user.password === data.password) {
            onlineUsers[data.username] = socket.id;

            const friendsData = user.friends.map(f => ({
                name:   f,
                online: !!onlineUsers[f],
                avatar: usersDB[f]?.avatar || '',
                bio:    usersDB[f]?.bio    || ''
            }));

            socket.emit('login_success', {
                username: data.username,
                avatar:   user.avatar,
                bio:      user.bio,
                friends:  friendsData,
                history:  messagesHistory.filter(m => m.from === data.username || m.to === data.username)
            });

            // notify friends this user came online
            user.friends.forEach(f => {
                if (onlineUsers[f]) {
                    io.to(onlineUsers[f]).emit('friend_updated', { name: data.username, online: true });
                }
            });
        } else {
            socket.emit('auth_error', 'Неверный логин или пароль');
        }
    });

    /* REGISTER */
    socket.on('register', (data) => {
        if (!data.username || !data.password) return socket.emit('auth_error', 'Заполни все поля');
        if (usersDB[data.username]) return socket.emit('auth_error', 'Этот ник уже занят');
        usersDB[data.username] = {
            password: data.password,
            bio:      'На связи AllWhite',
            avatar:   `https://ui-avatars.com/api/?name=${data.username}&background=8b0000&color=fff`,
            friends:  []
        };
        saveData();
        socket.emit('register_success');
    });

    /* PRIVATE MESSAGE */
    socket.on('private_message', (data) => {
        const from = whoIs(socket.id);
        if (!from) return;

        const msg = {
            id:       Date.now() + Math.random(), // unique id
            from,
            to:       data.to,
            text:     data.text   || '',
            type:     data.type   || 'text',
            fileData: data.fileData || null,
            fileName: data.fileName || null,
            edited:   false,
            deleted:  false,
            read:     false,
            time:     new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };

        messagesHistory.push(msg);
        saveData();

        // deliver to recipient if online
        if (onlineUsers[data.to]) io.to(onlineUsers[data.to]).emit('private_message', msg);
        // echo back to sender
        socket.emit('private_message', msg);
    });

    /* EDIT MESSAGE */
    socket.on('edit_message', (data) => {
        const from = whoIs(socket.id);
        if (!from) return;

        const msg = messagesHistory.find(m => m.id == data.id && m.from === from);
        if (!msg || msg.deleted) return;

        msg.text   = data.text;
        msg.edited = true;
        saveData();

        const payload = { id: msg.id, text: msg.text };
        socket.emit('message_edited', payload);
        if (onlineUsers[data.to]) io.to(onlineUsers[data.to]).emit('message_edited', payload);
    });

    /* DELETE MESSAGE */
    socket.on('delete_message', (data) => {
        const from = whoIs(socket.id);
        if (!from) return;

        const msg = messagesHistory.find(m => m.id == data.id && m.from === from);
        if (!msg) return;

        msg.deleted  = true;
        msg.text     = '';
        msg.fileData = null;
        saveData();

        const payload = { id: msg.id };
        socket.emit('message_deleted', payload);
        if (onlineUsers[data.to]) io.to(onlineUsers[data.to]).emit('message_deleted', payload);
    });

    /* ADD FRIEND */
    socket.on('add_friend', (name) => {
        const me = whoIs(socket.id);
        if (!me) return;
        if (!usersDB[name]) return socket.emit('auth_error', `Пользователь "${name}" не найден`);
        if (me === name)    return;
        if (usersDB[me].friends.includes(name)) return socket.emit('auth_error', 'Уже в друзьях');

        usersDB[me].friends.push(name);
        usersDB[name].friends.push(me);
        saveData();

        socket.emit('friend_added', {
            name,
            online: !!onlineUsers[name],
            avatar: usersDB[name]?.avatar || '',
            bio:    usersDB[name]?.bio    || ''
        });

        // notify the other side too
        if (onlineUsers[name]) {
            io.to(onlineUsers[name]).emit('friend_added', {
                name:   me,
                online: true,
                avatar: usersDB[me]?.avatar || '',
                bio:    usersDB[me]?.bio    || ''
            });
        }
    });

    /* UPDATE PROFILE */
    socket.on('update_profile', (data) => {
        const me = whoIs(socket.id);
        if (!me || !usersDB[me]) return;

        if (data.bio    !== undefined) usersDB[me].bio    = data.bio;
        if (data.avatar !== null && data.avatar !== undefined) usersDB[me].avatar = data.avatar;
        saveData();

        const payload = { username: me, bio: usersDB[me].bio, avatar: usersDB[me].avatar };

        // broadcast to all online friends
        usersDB[me].friends.forEach(f => {
            if (onlineUsers[f]) io.to(onlineUsers[f]).emit('profile_updated', payload);
        });
        socket.emit('profile_updated', payload);
    });

    /* DISCONNECT */
    socket.on('disconnect', () => {
        const name = whoIs(socket.id);
        if (!name) return;
        delete onlineUsers[name];
        if (usersDB[name]) {
            usersDB[name].friends.forEach(f => {
                if (onlineUsers[f]) io.to(onlineUsers[f]).emit('friend_updated', { name, online: false });
            });
        }
    });
});

http.listen(process.env.PORT || 3000, () => console.log('AllWhite Online'));
