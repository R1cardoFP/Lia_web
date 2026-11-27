const fs = require('node:fs/promises');
const path = require('node:path');
const pool = require('../config/database.config');
const { PROFILE_DIRECTORY } = require('../middleware/profile-image.middleware');
const { publicUser } = require('../utils/public-user');

function isProvided(body, field) {
  return Object.prototype.hasOwnProperty.call(body, field);
}

function previousProfileImagePath(image) {
  if (typeof image !== 'string') return null;
  const normalized = image.replace(/\\/g, '/');
  const fileName = normalized.slice('profiles/'.length);
  if (!normalized.startsWith('profiles/') || !fileName || path.basename(fileName) !== fileName) {
    return null;
  }
  return path.join(PROFILE_DIRECTORY, fileName);
}

async function removeFile(filePath) {
  if (!filePath) return;
  try {
    await fs.unlink(filePath);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

async function updateProfile(request, response) {
  const body = request.body ?? {};
  const phoneProvided = isProvided(body, 'phone');
  const phone = phoneProvided ? String(body.phone).trim() : request.user.phone;
  if (phoneProvided && !/^\d{9}$/.test(phone)) {
    try {
      await removeFile(request.file?.path);
    } catch (error) {
      console.error(error);
    }
    return response.status(422).json({
      status: 'error',
      message: 'O número de telemóvel deve conter exatamente 9 dígitos.',
    });
  }

  const values = {
    name: isProvided(body, 'name') ? body.name : request.user.name,
    phone,
    curso: isProvided(body, 'curso') ? body.curso : request.user.curso,
    n_aluno: isProvided(body, 'n_aluno') ? body.n_aluno : request.user.n_aluno,
    image: request.file ? `profiles/${request.file.filename}` : request.user.image,
  };

  let profileUpdated = false;
  try {
    await pool.query(
      `UPDATE users
          SET name = ?, phone = ?, curso = ?, n_aluno = ?, image = ?,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
      [values.name, values.phone, values.curso, values.n_aluno, values.image, request.user.id],
    );
    profileUpdated = true;
    const [users] = await pool.query('SELECT * FROM users WHERE id = ? LIMIT 1', [request.user.id]);
    if (!users[0]) throw new Error('Utilizador não encontrado após atualizar o perfil.');

    if (request.file) {
      const oldImage = previousProfileImagePath(request.user.image);
      if (oldImage && oldImage !== request.file.path) {
        try {
          await removeFile(oldImage);
        } catch (error) {
          console.error(error);
        }
      }
    }

    return response.status(200).json({
      status: 'success',
      message: 'Perfil atualizado com sucesso!',
      user: publicUser(users[0]),
    });
  } catch (error) {
    if (!profileUpdated) {
      try {
        await removeFile(request.file?.path);
      } catch (cleanupError) {
        console.error(cleanupError);
      }
    }
    console.error(error);
    return response.status(500).json({
      status: 'error',
      message: `Erro ao atualizar perfil: ${error.message}`,
    });
  }
}

async function estatisticas(request, response) {
  try {
    const userId = request.user.id;

    // Conta o total de reservas e as reservas ativas do utilizador
    const [[contadores]] = await pool.query(
      `SELECT COUNT(*) AS reservas,
              COALESCE(SUM(reserve_state_id IN (1, 2, 4, 7)), 0) AS ativas
       FROM reserves
       WHERE user_id = ?`,
      [userId],
    );

    // Soma as quantidades de itens e kits associados às reservas do utilizador
    const [[itens]] = await pool.query(
      `SELECT COALESCE(SUM(ir.quantity), 0) AS total
       FROM item_reserve ir
       INNER JOIN reserves r ON r.id = ir.reserve_id
       WHERE r.user_id = ?`,
      [userId],
    );
    const [[kits]] = await pool.query(
      `SELECT COALESCE(SUM(kr.quantity), 0) AS total
       FROM kit_reserve kr
       INNER JOIN reserves r ON r.id = kr.reserve_id
       WHERE r.user_id = ?`,
      [userId],
    );

    return response.status(200).json({
      status: 'success',
      data: {
        reservas: Number(contadores.reservas ?? 0),
        ativas: Number(contadores.ativas ?? 0),
        itens_usados: Number(itens.total ?? 0) + Number(kits.total ?? 0),
      },
    });
  } catch (error) {
    console.error(error);
    return response.status(500).json({ status: 'error', message: error.message });
  }
}

module.exports = { updateProfile, estatisticas };
