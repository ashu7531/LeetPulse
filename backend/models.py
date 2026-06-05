from flask_sqlalchemy import SQLAlchemy
import bcrypt
from datetime import datetime

db = SQLAlchemy()

# Association table for Batch <-> Students (Many-to-Many)
batch_students = db.Table(
    'batch_students',
    db.Column('batch_id', db.Integer, db.ForeignKey('batches.id', ondelete='CASCADE'), primary_key=True),
    db.Column('student_id', db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), primary_key=True)
)

class User(db.Model):
    __tablename__ = 'users'

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(20), nullable=False, default='STUDENT')  # 'TEACHER' or 'STUDENT'
    leetcode_username = db.Column(db.String(100), nullable=True)
    last_synced_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Relationships
    batches_taught = db.relationship('Batch', backref='teacher', lazy=True)
    progress_records = db.relationship('StudentProgress', backref='student', lazy=True, cascade="all, delete-orphan")

    def set_password(self, password):
        salt = bcrypt.gensalt()
        self.password_hash = bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')

    def check_password(self, password):
        return bcrypt.checkpw(password.encode('utf-8'), self.password_hash.encode('utf-8'))

    def to_dict(self):
        return {
            'id': self.id,
            'username': self.username,
            'email': self.email,
            'role': self.role,
            'leetcode_username': self.leetcode_username,
            'last_synced_at': self.last_synced_at.isoformat() if self.last_synced_at else None,
            'created_at': self.created_at.isoformat()
        }

class Batch(db.Model):
    __tablename__ = 'batches'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    description = db.Column(db.Text, nullable=True)
    teacher_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    join_code = db.Column(db.String(10), unique=True, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Relationships
    students = db.relationship('User', secondary=batch_students, backref=db.backref('enrolled_batches', lazy='dynamic'))
    assignments = db.relationship('Assignment', backref='batch', lazy=True, cascade="all, delete-orphan")

    def __init__(self, **kwargs):
        super(Batch, self).__init__(**kwargs)
        if not self.join_code:
            import random
            import string
            self.join_code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'description': self.description,
            'teacher_id': self.teacher_id,
            'join_code': self.join_code,
            'student_count': len(self.students),
            'created_at': self.created_at.isoformat()
        }

class Assignment(db.Model):
    __tablename__ = 'assignments'

    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(100), nullable=False)
    description = db.Column(db.Text, nullable=True)
    batch_id = db.Column(db.Integer, db.ForeignKey('batches.id', ondelete='CASCADE'), nullable=False)
    deadline = db.Column(db.DateTime, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Relationships
    problems = db.relationship('AssignmentProblem', backref='assignment', lazy=True, cascade="all, delete-orphan")

    def to_dict(self):
        return {
            'id': self.id,
            'title': self.title,
            'description': self.description,
            'batch_id': self.batch_id,
            'deadline': self.deadline.isoformat(),
            'total_problems': len(self.problems),
            'created_at': self.created_at.isoformat()
        }

class AssignmentProblem(db.Model):
    __tablename__ = 'assignment_problems'

    id = db.Column(db.Integer, primary_key=True)
    assignment_id = db.Column(db.Integer, db.ForeignKey('assignments.id', ondelete='CASCADE'), nullable=False)
    problem_id = db.Column(db.String(50), nullable=False)  # LeetCode problem ID (e.g. "1")
    title_slug = db.Column(db.String(255), nullable=False)  # LeetCode slug (e.g. "two-sum")
    title = db.Column(db.String(255), nullable=False)       # LeetCode title (e.g. "Two Sum")
    difficulty = db.Column(db.String(20), nullable=False)   # 'Easy', 'Medium', 'Hard'

    # Relationships
    progress_records = db.relationship('StudentProgress', backref='problem', lazy=True, cascade="all, delete-orphan")

    def to_dict(self):
        return {
            'id': self.id,
            'assignment_id': self.assignment_id,
            'problem_id': self.problem_id,
            'title_slug': self.title_slug,
            'title': self.title,
            'difficulty': self.difficulty
        }

class StudentProgress(db.Model):
    __tablename__ = 'student_progress'

    id = db.Column(db.Integer, primary_key=True)
    student_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    assignment_problem_id = db.Column(db.Integer, db.ForeignKey('assignment_problems.id', ondelete='CASCADE'), nullable=False)
    status = db.Column(db.String(20), nullable=False, default='PENDING')  # 'PENDING', 'ON_TIME', 'LATE'
    solved_at = db.Column(db.DateTime, nullable=True)
    submitted_code = db.Column(db.Text, nullable=True)
    submission_language = db.Column(db.String(50), nullable=True)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'student_id': self.student_id,
            'assignment_problem_id': self.assignment_problem_id,
            'status': self.status,
            'solved_at': self.solved_at.isoformat() if self.solved_at else None,
            'submitted_code': self.submitted_code,
            'submission_language': self.submission_language,
            'updated_at': self.updated_at.isoformat()
        }
