import type { NextFunction, Request, Response } from 'express';

export const setDiscountActiveMiddleware =
  (active: boolean) => (req: Request, res: Response, next: NextFunction) => {
    req.body.active = active;
    next();
  };
