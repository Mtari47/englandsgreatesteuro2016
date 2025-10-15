import os
from app import init_db

db_path = os.path.join(os.getcwd(), 'euro2016.db')
if os.path.exists(db_path):
    os.remove(db_path)
    print('Deleted existing euro2016.db')
else:
    print('No existing euro2016.db')

init_db()
print('Database recreated with init_db()')
