CREATE DATABASE IF NOT EXISTS digital_university
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE digital_university;

SET NAMES utf8mb4;
SET CHARACTER SET utf8mb4;

-- USERS
CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  max_user_id BIGINT UNSIGNED NOT NULL,
  role ENUM('student', 'teacher', 'staff', 'admin') NOT NULL DEFAULT 'student',
  coins_balance INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_max_user (max_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- CERTIFICATES
CREATE TABLE IF NOT EXISTS certificate_types (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO certificate_types (id, name, description, created_at) VALUES
  (1, 'Справка об обучении', NULL, NOW()),
  (2, 'Справка для военкомата', 'Для предоставления в военный комиссариат', NOW()),
  (3, 'Справка об успеваемости', 'С оценками и средним баллом за выбранный период', NOW()),
  (4, 'Справка об отсутствии академической задолженности', 'Подтверждает отсутствие долгов по дисциплинам', NOW()),
  (5, 'Справка о назначении и размере стипендии', 'Для предоставления в банк, соцзащиту, работодателю и т.п.', NOW()),
  (6, 'Справка для органов социальной защиты', 'Подтверждение статуса обучающегося для оформления льгот', NOW()),
  (7, 'Справка для банка/посольства', 'Подтверждение статуса студента для визы или образовательного кредита', NOW());

CREATE TABLE IF NOT EXISTS certificate_requests (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  certificate_type_id INT UNSIGNED NOT NULL,
  destination VARCHAR(255) NULL,
  status ENUM('pending','in_progress','ready','rejected','received') NOT NULL DEFAULT 'pending',
  comment TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_cert_req_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_cert_req_type FOREIGN KEY (certificate_type_id) REFERENCES certificate_types(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- IDEAS
CREATE TABLE ideas (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    author_user_id BIGINT UNSIGNED NOT NULL,
    title VARCHAR(255) NOT NULL,
    text TEXT NOT NULL,
    category VARCHAR(50) NOT NULL,
    status ENUM(
        'new',
        'under_review',
        'planned',
        'in_progress',
        'implemented',
        'rejected',
        'duplicate'
    ) NOT NULL DEFAULT 'new',
    likes_count INT NOT NULL DEFAULT 0,
    dislikes_count INT NOT NULL DEFAULT 0,
    is_deleted TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_ideas_author
        FOREIGN KEY (author_user_id) REFERENCES users(id)
        ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

CREATE TABLE idea_votes (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    idea_id BIGINT UNSIGNED NOT NULL,
    user_id BIGINT UNSIGNED NOT NULL,
    value ENUM('like', 'dislike') NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_idea_votes_idea
        FOREIGN KEY (idea_id) REFERENCES ideas(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_idea_votes_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE,
    UNIQUE KEY uniq_idea_user (idea_id, user_id)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

-- PASSES
CREATE TABLE IF NOT EXISTS pass_tokens (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  token VARCHAR(64) NOT NULL,
  type ENUM('student_pass', 'guest_pass') NOT NULL DEFAULT 'student_pass',
  used TINYINT(1) NOT NULL DEFAULT 0,
  expires_at DATETIME NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_pass_token (token),
  CONSTRAINT fk_pass_tokens_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS guest_passes (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    host_user_id BIGINT UNSIGNED NOT NULL,
    guest_name VARCHAR(255) NOT NULL,
    pass_token_id BIGINT UNSIGNED NOT NULL,
    valid_from DATETIME NOT NULL,
    valid_to DATETIME NOT NULL,
    status ENUM('active', 'used', 'cancelled') NOT NULL DEFAULT 'active',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_guest_passes_host FOREIGN KEY (host_user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_guest_passes_token FOREIGN KEY (pass_token_id) REFERENCES pass_tokens(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ORG STRUCTURE & CONTACTS
CREATE TABLE IF NOT EXISTS org_units (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  parent_id INT UNSIGNED NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_org_units_parent FOREIGN KEY (parent_id) REFERENCES org_units(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS contacts (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  org_unit_id INT UNSIGNED NULL,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(255) NULL,
  email VARCHAR(255) NULL,
  phone VARCHAR(50) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_contacts_org_unit FOREIGN KEY (org_unit_id) REFERENCES org_units(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- LESSON SURVEYS
CREATE TABLE IF NOT EXISTS lesson_surveys (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS lesson_responses (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  survey_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  rating TINYINT NOT NULL COMMENT '1-5',
  comment TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_lesson_responses_survey FOREIGN KEY (survey_id) REFERENCES lesson_surveys(id),
  CONSTRAINT fk_lesson_responses_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ACHIEVEMENTS & COINS
CREATE TABLE IF NOT EXISTS achievement_types (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  coins_reward INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_achievement_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_achievements (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  achievement_type_id INT UNSIGNED NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_user_achievement (user_id, achievement_type_id),
  CONSTRAINT fk_user_achievements_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_user_achievements_type FOREIGN KEY (achievement_type_id) REFERENCES achievement_types(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS coin_transactions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  amount INT NOT NULL,
  type ENUM('earn', 'spend') NOT NULL,
  reason VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_coin_transactions_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- LIBRARY
CREATE TABLE IF NOT EXISTS books (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(512) NOT NULL,
    author VARCHAR(512) NOT NULL,
    year INT NULL,
    total_copies INT NOT NULL,
    available_copies INT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO books (
  id, title, author, year,
  total_copies, available_copies,
  created_at, updated_at
) VALUES
  (1,
   'Алгоритмы. Построение и анализ',
   'Т. Кормен, Ч. Лейзерсон, Р. Ривест, К. Штайн',
   2015, 5, 5, NOW(), NOW()
  ),
  (2,
   'Чистый код. Создание, анализ и рефакторинг',
   'Роберт Мартин',
   2019, 4, 4, NOW(), NOW()
  ),
  (3,
   'Совершенный код. Мастер-класс',
   'Стив Макконнелл',
   2019, 3, 3, NOW(), NOW()
  ),
  (4,
   'Приёмы объектно-ориентированного проектирования. Паттерны проектирования',
   'Эрих Гамма, Ричард Хелм, Ральф Джонсон, Джон Влиссидес',
   2012, 3, 3, NOW(), NOW()
  ),
  (5,
   'Рефакторинг. Улучшение существующего кода',
   'Мартин Фаулер',
   2019, 2, 2, NOW(), NOW()
  );

CREATE TABLE IF NOT EXISTS book_requests (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    book_id BIGINT UNSIGNED NOT NULL,
    student_id BIGINT UNSIGNED NOT NULL,
    status ENUM('new','approved','rejected','issued','returned') NOT NULL DEFAULT 'new',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_book_requests_book FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
    CONSTRAINT fk_book_requests_student FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_book_requests_student (student_id),
    INDEX idx_book_requests_book (book_id),
    INDEX idx_book_requests_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ACCESS MANAGEMENT
CREATE TABLE IF NOT EXISTS access_types (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_access_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO access_types (id, code, name, created_at) VALUES
  (1, 'gitlab', 'Доступ к GitLab', NOW()),
  (2, 'parking_pass', 'Пропуск на парковку для автомобиля', NOW()),
  (3, 'vpn', 'VPN-доступ к внутренним ресурсам университета', NOW()),
  (4, 'wifi_extended', 'Расширенный доступ к Wi-Fi', NOW()),
  (5, 'lab_pc', 'Доступ к компьютерам лабораторий вне расписания', NOW());

CREATE TABLE IF NOT EXISTS access_requests (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  access_type_id INT UNSIGNED NOT NULL,
  status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  comment TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_access_requests_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_access_requests_type FOREIGN KEY (access_type_id) REFERENCES access_types(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_accesses (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  access_type_id INT UNSIGNED NOT NULL,
  granted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NULL,
  UNIQUE KEY uniq_user_access (user_id, access_type_id),
  CONSTRAINT fk_user_accesses_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_user_accesses_type FOREIGN KEY (access_type_id) REFERENCES access_types(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- BOT PROCESSED UPDATES (dedup for bot events)
CREATE TABLE IF NOT EXISTS bot_processed_updates (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  update_key VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_update_key (update_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
