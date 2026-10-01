export const USERNAME_LOGIN_LIMITS = {
  usernameLength: 64,
  passwordLength: 128,
  ipAttempts: 60,
  ipWindowSeconds: 300,
  identifierAttempts: 10,
  identifierWindowSeconds: 900,
} as const;

export function isValidLoginInput(username: unknown, password: unknown) {
  return (
    typeof username === "string" &&
    username.trim().length > 0 &&
    username.trim().length <= USERNAME_LOGIN_LIMITS.usernameLength &&
    !username.includes("@") &&
    typeof password === "string" &&
    password.length >= 8 &&
    password.length <= USERNAME_LOGIN_LIMITS.passwordLength
  );
}
