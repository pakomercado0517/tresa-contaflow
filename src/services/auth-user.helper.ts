import Subscription from '../database/models/Subscription.model.js';
import User from '../database/models/User.model.js';
import bcrypt from 'bcrypt';
import { generateVerificationToken, hashVerificationToken } from '../utils/verification.util.js';
import sequelize from '../database/config.js';
import type { Transaction } from 'sequelize';
import type { RegisterUserDto } from '../types/auth.types.js';

export const encryptPassword = async (password: string) => {
  return await bcrypt.hash(password, 10);
};

export const createUserWithSubscriptionHelper = async (
  userData: RegisterUserDto,
  transaction: Transaction
) => {
  const verificationToken = generateVerificationToken();
  const hashedToken = hashVerificationToken(verificationToken);
  const newUser = await User.create(
    {
      email: userData.email.toLocaleLowerCase().trim(),
      password_hash: (await encryptPassword(userData.password ?? '')) || null,
      nombre: userData.nombre ? userData.nombre.trim() : null,
      apellido: userData.apellido ? userData.apellido.trim() : null,
      telefono: userData.telefono ? userData.telefono.trim() : null,
      firebase_uid: userData.firebase_uid ? userData.firebase_uid.trim() : null,
      email_verified: false,
      email_verification_token: hashedToken,
      email_verification_expires: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
    { transaction }
  );
  await Subscription.create(
    {
      user_id: newUser.id,
      plan: 'FREE',
      status: 'ACTIVE',
    },
    { transaction }
  );
  return { newUser, verificationToken };
};
