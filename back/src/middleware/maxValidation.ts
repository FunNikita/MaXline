import crypto from 'crypto';

export interface MaxUser {
    id: number;
    first_name?: string;
    last_name?: string;
    username?: string | null;
    language_code?: string | null;
    photo_url?: string | null;
}

export interface MaxInitDataResult {
    ok: boolean;
    user?: MaxUser;
    raw?: Record<string, string>;
}

/**
 * Валидация InitData по алгоритму MAX:
 *
 * 1. Не делаем decodeURIComponent на всей строке целиком.
 * 2. Разбиваем исходную строку на пары по '&'.
 * 3. Для каждой пары декодируем key и value по отдельности через decodeURIComponent.
 * 4. Собираем data_check_string из отсортированных "key=value" с НЕзакодированными значениями.
 * 5. Считаем secret_key и hash.
 */
export function validateInitData(initData: string, botToken: string): MaxInitDataResult {
    if (!botToken) {
        throw new Error('MAX_BOT_TOKEN is not set');
    }

    const params: Record<string, string> = {};
    let hash: string | undefined;

    // ВАЖНО: работаем с ИСХОДНОЙ строкой, не декодируя её целиком
    const pairs = initData.split('&');

    for (const pair of pairs) {
        if (!pair) continue;

        const [encodedKey, ...encodedValueParts] = pair.split('=');
        const encodedValue = encodedValueParts.join('=');

        const key = decodeURIComponent(encodedKey);
        const value = decodeURIComponent(encodedValue);

        if (key === 'hash') {
            hash = value;
        } else {
            params[key] = value;
        }
    }

    if (!hash) {
        return { ok: false };
    }

    // Собираем data_check_string
    const dataCheckArray = Object.keys(params)
        .sort()
        .map((key) => `${key}=${params[key]}`);

    const dataCheckString = dataCheckArray.join('\n');

    // secret_key = HMAC_SHA256("WebAppData", BOT_TOKEN)
    const secretKey = crypto
        .createHmac('sha256', 'WebAppData')
        .update(botToken)
        .digest();

    // checkHash = hex(HMAC_SHA256(secret_key, data_check_string))
    const checkHash = crypto
        .createHmac('sha256', secretKey)
        .update(dataCheckString)
        .digest('hex');

    if (checkHash !== hash) {
        return { ok: false };
    }

    let user: MaxUser | undefined;
    if (params.user) {
        try {
            user = JSON.parse(params.user);
        } catch {
            // если JSON кривой — не валим весь запрос, просто без user
        }
    }

    return {
        ok: true,
        user,
        raw: params,
    };
}
