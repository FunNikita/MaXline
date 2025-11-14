// src/middleware/maxAuth.ts
import { NextFunction, Request, Response } from 'express';
import { AppUser, upsertUserFromMaxUser } from '../modules/users/user.service';
import { MaxInitDataResult, MaxUser, validateInitData } from './maxValidation';

export interface MaxRequest extends Request {
    maxUser?: MaxUser;
    maxInitData?: MaxInitDataResult['raw'];
    appUser?: AppUser;
}

export async function requireMaxAuth(req: MaxRequest, res: Response, next: NextFunction) {
    const initData = req.header('x-max-init-data');
    if (!initData) {
        return res.status(401).json({ error: 'Missing MAX InitData' });
    }

    try {
        const result = validateInitData(initData, process.env.MAX_BOT_TOKEN || '');

        if (!result.ok || !result.user) {
            return res.status(401).json({ error: 'Invalid MAX InitData' });
        }

        // Каждый запрос: апсертим пользователя по max_user_id
        const appUser = await upsertUserFromMaxUser(result.user);

        req.maxUser = result.user;
        req.maxInitData = result.raw;
        req.appUser = appUser;

        return next();
    } catch (err) {
        console.error('MAX auth error:', err);
        return res.status(500).json({ error: 'MAX auth internal error' });
    }
}
