const MONTHS_SHORT = [
    'янв',
    'фев',
    'мар',
    'апр',
    'мая',
    'июн',
    'июл',
    'авг',
    'сен',
    'окт',
    'ноя',
    'дек',
];

function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function pad2(num) {
    return num < 10 ? `0${num}` : String(num);
}

export function formatDateTime(value) {
    if (!value) return '';

    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';

    const now = new Date();
    const nowStart = startOfDay(now);
    const dateStart = startOfDay(date);

    const diffMs = nowStart - dateStart;
    const diffDays = Math.round(diffMs / (24 * 60 * 60 * 1000));

    const timePart = `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;

    if (diffDays === 0) {
        return `сегодня в ${timePart}`;
    }

    if (diffDays === 1) {
        return `вчера в ${timePart}`;
    }

    const day = date.getDate();
    const month = MONTHS_SHORT[date.getMonth()];
    const year = date.getFullYear();

    if (year === now.getFullYear()) {
        return `${day} ${month} в ${timePart}`;
    }

    return `${day} ${month} ${year} в ${timePart}`;
}
