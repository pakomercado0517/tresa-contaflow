import Period from '../database/models/Period.model.js';

const getPeriodDates = (mes: number, año: number) => {
  const lastDay = new Date(año, mes, 0).getDate();
  const startDate = new Date(año, mes - 1, 1, 0, 0, 0);
  const endDate = new Date(año, mes - 1, lastDay, 23, 59, 59);

  return { startDate, endDate };
};

export const findPeriodForMont = async (
  profileId: string,
  mes: number,
  año: number
): Promise<Period | null> => {
  const { startDate, endDate } = getPeriodDates(mes, año);
  return Period.findOne({
    where: {
      profile_id: profileId,
      start_date: startDate,
      end_date: endDate,
    },
    attributes: ['id'],
  });
};

export const ensurePeriodExist = async (profileId: string, mes: number, año: number) => {
  const { startDate, endDate } = getPeriodDates(mes, año);

  const [period] = await Period.findOrCreate({
    where: {
      profile_id: profileId,
      start_date: startDate,
      end_date: endDate,
    },
    defaults: {
      profile_id: profileId,
      start_date: startDate,
      end_date: endDate,
    },
  });
  return period;
};
