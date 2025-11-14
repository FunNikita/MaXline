export function getFullName(user) {
    if (!user) return 'Пользователь';
    const { first_name, last_name } = user;
    const name = [first_name, last_name].filter(Boolean).join(' ');
    return name || 'Пользователь';
}
