'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Limpiar estado parcial de intentos anteriores
    await queryInterface.sequelize.query(
      'DROP TABLE IF EXISTS profile_payment_complements CASCADE;'
    );
    await queryInterface.sequelize.query(
      'DROP TYPE IF EXISTS "enum_profile_payment_complements_role";'
    );

    // 1. Crear tabla de relación perfil ↔ complemento
    await queryInterface.createTable('profile_payment_complements', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      profile_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'profiles',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      complement_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'payment_complements',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      role: {
        type: Sequelize.ENUM('INGRESO', 'EGRESO'),
        allowNull: false,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    await queryInterface.addIndex('profile_payment_complements', ['profile_id']);
    await queryInterface.addIndex('profile_payment_complements', ['complement_id']);
    await queryInterface.addConstraint('profile_payment_complements', {
      fields: ['profile_id', 'complement_id'],
      type: 'unique',
      name: 'profile_complement_unique',
    });

    // 2. Migrar datos existentes (solo si payment_complements aún tiene profile_id)
    const [columns] = await queryInterface.sequelize.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'payment_complements' AND column_name = 'profile_id'
    `);

    if (columns.length > 0) {
      await queryInterface.sequelize.query(`
        INSERT INTO profile_payment_complements (id, profile_id, complement_id, role, created_at, updated_at)
        SELECT
          gen_random_uuid(),
          pc.profile_id,
          pc.id,
          (CASE
            WHEN p.rfc = pc.rfc_emisor THEN 'INGRESO'
            WHEN p.rfc = pc.rfc_receptor THEN 'EGRESO'
            ELSE 'INGRESO'
          END)::"enum_profile_payment_complements_role",
          pc.created_at,
          pc.updated_at
        FROM payment_complements pc
        JOIN profiles p ON p.id = pc.profile_id
      `);

      try {
        await queryInterface.removeIndex('payment_complements', ['profile_id']);
      } catch {
        // El índice puede no existir con ese nombre exacto
      }
      await queryInterface.removeColumn('payment_complements', 'profile_id');
    }
  },

  async down(queryInterface, Sequelize) {
    // 1. Restaurar columna profile_id en payment_complements
    await queryInterface.addColumn('payment_complements', 'profile_id', {
      type: Sequelize.UUID,
      allowNull: true,
      references: {
        model: 'profiles',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    });

    // 2. Restaurar datos: tomar el primer vínculo de cada complemento
    await queryInterface.sequelize.query(`
      UPDATE payment_complements pc
      SET profile_id = ppc.profile_id
      FROM (
        SELECT DISTINCT ON (complement_id) complement_id, profile_id
        FROM profile_payment_complements
        ORDER BY complement_id, created_at ASC
      ) ppc
      WHERE pc.id = ppc.complement_id
    `);

    // 3. Hacer profile_id NOT NULL después de restaurar datos
    await queryInterface.changeColumn('payment_complements', 'profile_id', {
      type: Sequelize.UUID,
      allowNull: false,
      references: {
        model: 'profiles',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    });

    await queryInterface.addIndex('payment_complements', ['profile_id']);

    // 4. Eliminar tabla de relación
    await queryInterface.dropTable('profile_payment_complements');
    await queryInterface.sequelize.query(
      'DROP TYPE IF EXISTS "enum_profile_payment_complements_role";'
    );
  },
};
