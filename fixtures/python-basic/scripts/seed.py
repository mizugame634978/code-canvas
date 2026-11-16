"""初期データ投入。ドット区切りの import と、カンマで並べた import を使う。"""
import sys, app.models.user

if __name__ == "__main__":
    print(app.models.user.User("admin"), file=sys.stdout)
