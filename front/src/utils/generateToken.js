const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

export function generateToken(length = 32) {
    let res = '';
    for (let i = 0; i < length; i += 1) {
        res += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    return res;
}
