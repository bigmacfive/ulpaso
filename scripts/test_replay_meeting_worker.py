import io
import struct
import unittest

from replay_meeting_worker import markdown_from_final, write_frame


class ReplayMeetingWorkerTests(unittest.TestCase):
    def test_frame_matches_worker_protocol(self):
        target = io.BytesIO()
        write_frame(target, 1, b"pcm")
        self.assertEqual(target.getvalue(), b"\x01" + struct.pack("<I", 3) + b"pcm")

    def test_final_segments_are_exported_as_standard_markdown(self):
        markdown = markdown_from_final(
            "미팅 노트",
            {
                "segments": [
                    {"speaker": 1, "text": "첫 문장"},
                    {"speaker": 2, "text": "다음 문장"},
                ]
            },
        )
        self.assertEqual(
            markdown,
            "## 미팅 노트\n\n**화자 1**\n\n첫 문장\n\n**화자 2**\n\n다음 문장\n",
        )


if __name__ == "__main__":
    unittest.main()
