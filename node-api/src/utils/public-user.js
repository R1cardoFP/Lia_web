function publicUser(user) {
  const { password, remember_token: _rememberToken, ...userWithoutSecrets } = user;
  return userWithoutSecrets;
}

module.exports = { publicUser };
