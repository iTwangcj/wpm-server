require('shelljs/global');
const chalk = require('chalk');
const io = require('socket.io').listen(3000);
const chokidar = require('chokidar');
const path = require('path');
const fs = require('fs');
const _ = require('lodash');
const execSync = require('child_process').execSync;
const users = require('./db').users;
const cryptHelper = require('./cryptHelper');

const node_modules = 'node_modules';
const downloadPath = path.resolve(__dirname, '../download');

//去除左右空格
const trim = (str) => {
	if (!str || typeof str !== 'string') return str;
	return str.replace(/^\s+|\s+$/g, '');
};

const getUser = (username) => {
	return users.filter(user => username === user.username)[0];
};

io.sockets.on('connection', (conn) => {
	let user = null;
	const loginValidate = (data) => {
		user = getUser(data.username);
		if (!user) {
			conn.emit('validation', '用户名错误');
			return false;
		}
		if (user.password !== data.password) {
			conn.emit('validation', '密码错误');
			return false;
		}
	};
	
	conn.on('login', function (data) {
		// console.log('client Request login: %s', JSON.stringify(data));
		if (loginValidate(data)) return;
		conn.emit('login_success', cryptHelper.encrypt(JSON.stringify(data)));
	});
	conn.on('data', function ({ authInfo, params }) {
		// console.log('client Request data: %s', data);
		// console.log('cryptoHelper.decrypt data: %s', cryptHelper.decrypt(authInfo));
		const jsonData = JSON.parse(cryptHelper.decrypt(authInfo));
		if (loginValidate(jsonData)) return;
		handleCommand(conn, params, user.username);
	});
	conn.on('disconnect', function () {
		console.log('socket disconnect username: %s', user.username);
	});
});

const handleCommand = (conn, params, username) => {
	let count = 0;
	let result = '';
	// let socketId = conn.id;
	// console.log('socketId: %s', socketId);
	// const userPath = path.resolve(downloadPath, socketId);
	const userPath = path.resolve(downloadPath, username);
	const watchPath = path.resolve(userPath, node_modules);
	
	return Promise.resolve()
	.then(() => global.rm('-Rf', userPath))
	.then(() => global.mkdir(userPath))
	.then(() => global.mkdir(watchPath))
	.then(() => {
		const watcher = chokidar.watch(watchPath);
		const log = console.log.bind(console);
		// Add event listeners.
		watcher
		.on('add', filePath => {
			count += 1;
			sendDataToClient(conn, filePath, params.node_modules_path);
		})
		.on('change', filePath => {
			count += 1;
			sendDataToClient(conn, filePath, params.node_modules_path);
		})
		.on('unlink', path => log(`File ${path} has been removed`))
		.on('error', error => log(`Watcher error: ${error}`))
		.on('ready', () => {
			log('Initial scan complete. Ready for changes');
			// 获得当前文件夹下的所有的文件夹和文件
			const files = getAllFiles(watchPath);
			let num = 0;
			const timer = setInterval(() => {
				num++;
				if (files.length >= count || num === 100) {
					clearInterval(timer);
					// global.rm('-Rf', userPath);
					// Un-watch some files.
					watcher.unwatch(watchPath);
					conn.emit('result', result);
				}
			}, 500);
		});
	})
	.then(() => global.cd(userPath))
	.then(() => result = execSync(`npm ${params.command}`).toString())
	// error catch
	.catch(e => {
		global.echo(chalk.red('Build failed. See below for errors.\n'));
		global.echo(chalk.red(e.stack));
		process.exit(1);
	});
};

const sendDataToClient = (conn, filePath, node_modules_path) => {
	let data = fs.readFileSync(filePath, 'binary'); // 兼容图片等格式
	const tmpArr = filePath.split(node_modules);
	tmpArr[0] = node_modules_path + '/';
	let resPath = tmpArr.join(node_modules);
	conn.emit('data', { path: resPath, data: data });
};

const isFile = (path) => {
	return fs.existsSync(path) && fs.statSync(path).isFile();
};


/**
 * 获取文件夹下面的所有的文件(包括子文件夹)
 * @param {String} dir
 * @returns {Array}
 */
const getAllFiles = (dir) => {
	let AllFiles = [];
	const iteration = (dirPath) => {
		const [dirs, files] = _(fs.readdirSync(dirPath)).partition(p => fs.statSync(path.join(dirPath, p)).isDirectory());
		files.forEach(file => AllFiles.push(path.join(dirPath, file)));
		for (const _dir of dirs) {
			iteration(path.join(dirPath, _dir));
		}
	};
	iteration(dir);
	return AllFiles;
};