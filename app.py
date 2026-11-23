"""Run the local question bank: python app.py."""

from notebook import create_app

if __name__ == "__main__":
    create_app().run(host="127.0.0.1", port=8765, debug=False)
