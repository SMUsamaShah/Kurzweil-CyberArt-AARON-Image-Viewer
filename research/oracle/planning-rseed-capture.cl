;;; Capture one startup rseed file with an unlimited printer length.  The
;;; ordinary runtime writes only the first 200 state words followed by `...`;
;;; this holdout checks whether that truncation is just a printer setting.
(in-package :cl-user)
(set '*print-length* nil)
(set 'aaron-planning-seed 1234)
(set 'aaron-planning-set-rseed nil)
(set 'aaron-planning-rseed-roundtrip t)
(load "C:\\temp\\planning-random-seed-common.cl")
