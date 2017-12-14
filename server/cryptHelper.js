'use strict';
/* ===================================
 * 加解密工具类
 * Created by Wangcj on 2017/04/18.
 * Copyright 2017 Yooli, Inc.
 * =================================== */
const crypto = require('crypto');

const key = '123qwe!@#'; //默认加密key

//去除左右空格
const trim = (str) => {
	if (!str || typeof str !== 'string') return str;
	return str.replace(/^\s+|\s+$/g, '');
};

module.exports = {
	
	/**
	 * sha1加密
	 * @param source    要加密串
	 * @param encoding  source的编码格式默认utf-8
	 * @return 返回加密后的16进制字符
	 */
	getEncryptStrBySHA1 (source, encoding) {
		if (!encoding) {
			encoding = 'utf-8';
		}
		if (!source) {
			return null;
		}
		return crypto.createHash('sha1').update(source.toString(), encoding).digest('hex');
	},
	
	/**
	 * 对source双向加密
	 * @param source     要加密的字符串
	 * @param encryptKey 加密key
	 * @param outputEncoding  字符编码 'utf8', 'ascii' or 'binary'
	 * @param inputEncoding   字符编码 'utf8', 'ascii' or 'binary'
	 * @return 加密后字符
	 */
	encrypt (source, encryptKey, outputEncoding, inputEncoding) {
		if (!inputEncoding) {
			inputEncoding = 'utf-8';
		}
		if (!outputEncoding) {
			outputEncoding = 'hex';
		}
		if (!source) {
			return null;
		}
		if (!encryptKey) {
			encryptKey = key;
		}
		let cipher = crypto.createCipher('aes-256-cbc', encryptKey);
		let str = cipher.update(source, inputEncoding, outputEncoding);
		str += cipher.final(outputEncoding);
		str = trim(str);
		return str;
	},
	
	/**
	 * 对字符串进行解密
	 * @param source     解密字符串
	 * @param decryptKey 解密密匙
	 * @param outputEncoding  字符编码 'utf8', 'ascii' or 'binary'
	 * @param inputEncoding   字符编码 'utf8', 'ascii' or 'binary'
	 * return 解密后字符
	 */
	decrypt (source, decryptKey, outputEncoding, inputEncoding) {
		source = trim(source);
		if (!outputEncoding) {
			outputEncoding = 'utf-8';
		}
		if (!inputEncoding) {
			inputEncoding = 'hex';
		}
		if (!source) {
			return null;
		}
		if (!decryptKey) {
			decryptKey = key;
		}
		let decipher = crypto.createDecipher('aes-256-cbc', decryptKey);
		let dec;
		try {
			dec = decipher.update(source, inputEncoding, outputEncoding);
			dec += decipher.final(outputEncoding);
		} catch (err) {
			console.error(err);
			console.log('fail to decrypt source. %j', source);
			return null;
		}
		return dec;
	},
	
	/**
	 * 对source进行MD5加密
	 * @param source     要加密的字符串
	 * @return 加密后字符
	 */
	md5 (source) {
		return crypto.createHash('md5').update(source.toString()).digest('hex');
	},
	
	/**
	 * 对source进行base64转码
	 * @param source    要转码的字符串
	 * @return String
	 */
	base64 (source) {
		return new Buffer(source.toString()).toString('base64');
	}
};