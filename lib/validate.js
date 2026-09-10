const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(email) {
  return typeof email === 'string' && EMAIL_RE.test(email);
}

function isValidPassword(password) {
  return typeof password === 'string' && password.length >= 8;
}

const HANDLE_RE = /^[a-z][a-z0-9-]{2,29}$/;

function isValidHandle(handle) {
  return typeof handle === 'string' && HANDLE_RE.test(handle);
}

module.exports = { isValidEmail, isValidPassword, isValidHandle };
